import type { LookupAddress } from "node:dns";
import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP, type LookupFunction } from "node:net";

export type SafeOutboundOptions = {
  allowedHostnames?: string[];
  allowHttp?: boolean;
  allowPrivateDevelopmentHosts?: string[];
  maxRedirects?: number;
  maxResponseBytes?: number;
  timeoutMs?: number;
  allowedContentTypes?: string[];
};

export type SafeOutboundDependencies = {
  resolve?: (hostname: string) => Promise<LookupAddress[]>;
};

type ValidatedDestination = {
  hostname: string;
  address: string;
  family: 4 | 6;
};

/**
 * Outbound HTTP with a single security authority for DNS validation and socket
 * connection. The validated address is injected into the transport lookup, so
 * Node cannot perform a second DNS lookup between validation and connect.
 */
export class SafeOutboundHttpClient {
  private readonly resolve: (hostname: string) => Promise<LookupAddress[]>;

  constructor(
    private readonly defaults: SafeOutboundOptions = {},
    dependencies: SafeOutboundDependencies = {},
  ) {
    this.resolve =
      dependencies.resolve ??
      ((hostname) => dnsLookup(hostname, { all: true, verbatim: true }));
  }

  async fetch(
    input: string | URL,
    init: RequestInit = {},
    options: SafeOutboundOptions = {},
  ) {
    const policy = { ...this.defaults, ...options };
    const maxRedirects = policy.maxRedirects ?? 3;
    let url = new URL(input);
    let requestInit = { ...init };

    for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
      const destination = await this.validateUrl(url, policy);
      const response = await this.requestPinned(
        url,
        destination,
        requestInit,
        policy,
      );
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        if (!location || redirect === maxRedirects)
          throw new Error("OUTBOUND_REDIRECT_DENIED");
        url = new URL(location, url);
        if (
          response.status === 303 ||
          ((response.status === 301 || response.status === 302) &&
            requestInit.method?.toUpperCase() === "POST")
        ) {
          requestInit = { ...requestInit, method: "GET", body: undefined };
        }
        continue;
      }
      this.validateContentType(response, policy);
      return response;
    }
    throw new Error("OUTBOUND_REDIRECT_DENIED");
  }

  async json(
    input: string | URL,
    init: RequestInit = {},
    options: SafeOutboundOptions = {},
  ) {
    const limit =
      options.maxResponseBytes ?? this.defaults.maxResponseBytes ?? 2_000_000;
    const response = await this.fetch(input, init, {
      allowedContentTypes: [
        "application/json",
        ...(options.allowedContentTypes ?? []),
      ],
      ...options,
    });
    const body = await this.readBounded(response, limit);
    return JSON.parse(body.toString("utf8")) as unknown;
  }

  private async validateUrl(
    url: URL,
    policy: SafeOutboundOptions,
  ): Promise<ValidatedDestination> {
    if (url.username || url.password)
      throw new Error("OUTBOUND_URL_CREDENTIALS_DENIED");
    if (
      url.protocol !== "https:" &&
      !(policy.allowHttp && url.protocol === "http:")
    )
      throw new Error("OUTBOUND_SCHEME_DENIED");
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    if (["metadata.google.internal"].includes(hostname))
      throw new Error("OUTBOUND_METADATA_DENIED");
    const allowlist = policy.allowedHostnames?.map((item) =>
      item.toLowerCase().replace(/\.$/, ""),
    );
    if (allowlist?.length && !allowlist.includes(hostname))
      throw new Error("OUTBOUND_HOST_NOT_ALLOWLISTED");
    const allowPrivate = policy.allowPrivateDevelopmentHosts
      ?.map((item) => item.toLowerCase().replace(/\.$/, ""))
      .includes(hostname);
    const addresses = isIP(hostname)
      ? [{ address: hostname, family: isIP(hostname) as 4 | 6 }]
      : await this.resolve(hostname);
    if (!addresses.length) throw new Error("OUTBOUND_DNS_EMPTY");
    if (
      !allowPrivate &&
      addresses.some(({ address }) => isForbiddenAddress(address))
    ) {
      throw new Error("OUTBOUND_PRIVATE_ADDRESS_DENIED");
    }
    const selected = addresses[0];
    return {
      hostname,
      address: selected.address,
      family: selected.family as 4 | 6,
    };
  }

  private requestPinned(
    url: URL,
    destination: ValidatedDestination,
    init: RequestInit,
    policy: SafeOutboundOptions,
  ): Promise<Response> {
    const limit = policy.maxResponseBytes ?? 2_000_000;
    const headers = new Headers(init.headers);
    headers.delete("host");
    const body = normalizeRequestBody(init.body);
    if (body && !headers.has("content-length"))
      headers.set("content-length", String(body.byteLength));
    const lookup = ((_hostname, lookupOptions, callback) => {
      if (
        typeof lookupOptions === "object" &&
        lookupOptions !== null &&
        lookupOptions.all
      ) {
        callback(null, [
          { address: destination.address, family: destination.family },
        ]);
        return;
      }
      callback(null, destination.address, destination.family);
    }) as LookupFunction;
    const transport = url.protocol === "https:" ? httpsRequest : httpRequest;

    return new Promise<Response>((resolve, reject) => {
      const controller = new AbortController();
      const abort = () => controller.abort(init.signal?.reason);
      if (init.signal?.aborted) abort();
      else init.signal?.addEventListener("abort", abort, { once: true });
      const timeout = setTimeout(
        () => controller.abort(new Error("OUTBOUND_TIMEOUT")),
        policy.timeoutMs ?? 15_000,
      );
      const finish = () => {
        clearTimeout(timeout);
        init.signal?.removeEventListener("abort", abort);
      };

      const request = transport(
        {
          protocol: url.protocol,
          hostname: destination.hostname,
          port: url.port || undefined,
          path: `${url.pathname}${url.search}`,
          method: init.method ?? "GET",
          headers: Object.fromEntries(headers.entries()),
          lookup,
          servername:
            url.protocol === "https:" ? destination.hostname : undefined,
          rejectUnauthorized: true,
          signal: controller.signal,
        },
        (incoming) => {
          const responseHeaders = new Headers();
          for (let index = 0; index < incoming.rawHeaders.length; index += 2) {
            responseHeaders.append(
              incoming.rawHeaders[index],
              incoming.rawHeaders[index + 1],
            );
          }
          const advertisedSize = Number(responseHeaders.get("content-length"));
          if (Number.isFinite(advertisedSize) && advertisedSize > limit) {
            incoming.destroy(new Error("OUTBOUND_RESPONSE_TOO_LARGE"));
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          incoming.on("data", (chunk: Buffer) => {
            size += chunk.byteLength;
            if (size > limit) {
              incoming.destroy(new Error("OUTBOUND_RESPONSE_TOO_LARGE"));
              return;
            }
            chunks.push(Buffer.from(chunk));
          });
          incoming.on("end", () => {
            finish();
            resolve(
              new Response(Buffer.concat(chunks), {
                status: incoming.statusCode ?? 502,
                statusText: incoming.statusMessage,
                headers: responseHeaders,
              }),
            );
          });
          incoming.on("error", (error) => {
            finish();
            reject(error);
          });
        },
      );
      request.on("error", (error) => {
        finish();
        reject(error);
      });
      if (body) request.write(body);
      request.end();
    });
  }

  private validateContentType(response: Response, policy: SafeOutboundOptions) {
    if (!policy.allowedContentTypes?.length) return;
    const type = (response.headers.get("content-type") ?? "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (!policy.allowedContentTypes.includes(type))
      throw new Error("OUTBOUND_CONTENT_TYPE_DENIED");
  }

  private async readBounded(response: Response, limit: number) {
    if (!response.body) return Buffer.alloc(0);
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new Error("OUTBOUND_RESPONSE_TOO_LARGE");
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  }
}

function normalizeRequestBody(body: RequestInit["body"] | null | undefined) {
  if (body === undefined || body === null) return undefined;
  if (typeof body === "string") return Buffer.from(body);
  if (body instanceof URLSearchParams) return Buffer.from(body.toString());
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (ArrayBuffer.isView(body))
    return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  throw new Error("OUTBOUND_REQUEST_BODY_UNSUPPORTED");
}

export function isForbiddenAddress(addressInput: string) {
  let address = addressInput.toLowerCase();
  if (address.startsWith("::ffff:")) address = address.slice(7);
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  if (isIP(address) === 6) {
    return (
      address === "::" ||
      address === "::1" ||
      address === "fd00:ec2::254" ||
      address.startsWith("fc") ||
      address.startsWith("fd") ||
      /^fe[89ab]/.test(address) ||
      address.startsWith("ff")
    );
  }
  return true;
}
