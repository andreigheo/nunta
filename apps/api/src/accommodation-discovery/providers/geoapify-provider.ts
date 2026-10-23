import { randomUUID } from "node:crypto";
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
} from "@nestjs/common";
import IORedis from "ioredis";
import { z } from "zod";
import { SafeOutboundHttpClient } from "../../common/safe-outbound-http.client";

export const GEOAPIFY_ATTRIBUTION = {
  text: "Powered by Geoapify · © OpenStreetMap contributors",
  url: "https://www.geoapify.com/",
};
export const GEOAPIFY_RESULT_LIMIT = 100;

export const geoapifyFeatureSchema = z.object({
  properties: z
    .object({
      place_id: z.string().min(1).max(2048).optional(),
      name: z.string().max(1000).optional(),
      formatted: z.string().max(2000).optional(),
      city: z.string().max(500).optional(),
      country: z.string().max(500).optional(),
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      categories: z.array(z.string()).max(100).optional(),
      datasource: z
        .object({ raw: z.record(z.unknown()).optional() })
        .optional(),
    })
    .passthrough(),
});
export type GeoapifyFeature = z.infer<typeof geoapifyFeatureSchema>;

// One shared rolling 24h budget across all API replicas and workspaces. Reserve
// the maximum cost before sending; failures retain the reservation. This stays
// below Free's 3,000 credits/day regardless of the provider's daily timezone.
export const GEOAPIFY_RESERVE_SCRIPT = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - 86400000)
local rows = redis.call('ZRANGE', KEYS[1], 0, -1)
local used = 0
for _, member in ipairs(rows) do used = used + tonumber(string.match(member, '^(%d+):')) end
if used + tonumber(ARGV[1]) > 2700 then return -1 end
if redis.call('ZCOUNT', KEYS[1], now - 1000, '+inf') >= 4 then return -2 end
redis.call('ZADD', KEYS[1], now, ARGV[1] .. ':' .. ARGV[2])
redis.call('EXPIRE', KEYS[1], 90000)
return used + tonumber(ARGV[1])
`;

@Injectable()
export class GeoapifyProvider implements OnModuleDestroy {
  private redis: IORedis | undefined;
  private connecting: Promise<void> | undefined;
  private readonly logger = new Logger(GeoapifyProvider.name);

  constructor(
    @Inject(SafeOutboundHttpClient)
    private readonly http: SafeOutboundHttpClient,
  ) {}

  async reserveCredits(credits: number) {
    if (!this.redis) {
      if (!process.env.REDIS_URL)
        throw new Error("GEOAPIFY_BUDGET_UNAVAILABLE");
      this.redis = new IORedis(process.env.REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 1000,
        enableOfflineQueue: false,
      });
      this.redis.on("error", () => undefined);
    }
    if (this.redis.status === "wait") {
      this.connecting = this.redis.connect().finally(() => {
        this.connecting = undefined;
      });
    }
    if (this.connecting) await this.connecting;
    const result = Number(
      await this.redis.eval(
        GEOAPIFY_RESERVE_SCRIPT,
        1,
        "sarbato:accommodation:geoapify:budget:v1",
        credits,
        randomUUID(),
      ),
    );
    if (result < 0)
      throw new Error(
        result === -1 ? "GEOAPIFY_DAILY_LIMIT" : "GEOAPIFY_RATE_LIMIT",
      );
  }

  async places(latitude: number, longitude: number, radiusKm: number) {
    return this.request(
      "/v2/places",
      {
        categories:
          "accommodation.hotel,accommodation.guest_house,accommodation.hostel,accommodation.motel,accommodation.apartment,accommodation.chalet",
        filter: `circle:${longitude},${latitude},${radiusKm * 1000}`,
        bias: `proximity:${longitude},${latitude}`,
        limit: String(GEOAPIFY_RESULT_LIMIT),
        lang: "ro",
      },
      Math.ceil(GEOAPIFY_RESULT_LIMIT / 20),
    );
  }

  async geocode(query: string) {
    return this.request(
      "/v1/geocode/search",
      { text: query, limit: "1", lang: "ro" },
      1,
    );
  }

  private async request(
    path: string,
    parameters: Record<string, string>,
    credits: number,
  ): Promise<unknown[]> {
    const key = process.env.GEOAPIFY_API_KEY?.trim();
    if (!key) throw new Error("GEOAPIFY_NOT_CONFIGURED");
    await this.reserveCredits(credits);
    // Fixed HTTPS origin; no redirects or configurable endpoint can leak a key.
    const url = new URL(path, "https://api.geoapify.com");
    for (const [name, value] of Object.entries(parameters))
      url.searchParams.set(name, value);
    const response = await this.http.fetch(
      url,
      { headers: { accept: "application/json", "x-api-key": key } },
      {
        allowedHostnames: ["api.geoapify.com"],
        maxRedirects: 0,
        timeoutMs: 6000,
        maxResponseBytes: 2_000_000,
        allowedContentTypes: ["application/json", "application/geo+json"],
      },
    );
    if (!response.ok) {
      this.logger.warn(`Geoapify HTTP ${response.status}`);
      throw new Error("GEOAPIFY_UNAVAILABLE");
    }
    return z
      .object({
        type: z.literal("FeatureCollection"),
        features: z.array(z.unknown()).max(GEOAPIFY_RESULT_LIMIT),
      })
      .parse(await response.json()).features;
  }

  async onModuleDestroy() {
    this.redis?.disconnect();
  }
}
