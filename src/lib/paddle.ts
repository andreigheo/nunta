export type PaddleEnvironment = "sandbox" | "production";

export type PaddleInstance = {
  Environment: { set: (environment: "sandbox") => void };
  Initialize: (input: { token: string }) => void;
  Checkout: {
    open: (input: {
      transactionId: string;
      settings?: {
        displayMode?: "overlay";
        theme?: "light" | "dark";
        successUrl?: string;
      };
    }) => void;
  };
};

declare global {
  interface Window {
    Paddle?: PaddleInstance;
  }
}

let paddlePromise: Promise<PaddleInstance> | null = null;
let initializedToken: string | null = null;

export async function loadPaddle(
  token: string,
  environment: PaddleEnvironment,
): Promise<PaddleInstance> {
  if (!paddlePromise) {
    paddlePromise = new Promise<PaddleInstance>((resolve, reject) => {
      const ready = () => {
        if (window.Paddle) resolve(window.Paddle);
        else reject(new Error("Paddle.js nu a expus clientul de checkout."));
      };
      if (window.Paddle) {
        ready();
        return;
      }
      const existing = document.querySelector<HTMLScriptElement>(
        'script[data-sarbato-paddle="true"]',
      );
      if (existing) {
        existing.addEventListener("load", ready, { once: true });
        existing.addEventListener(
          "error",
          () => reject(new Error("Paddle.js nu a putut fi încărcat.")),
          { once: true },
        );
        return;
      }
      const script = document.createElement("script");
      script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
      script.async = true;
      script.dataset.sarbatoPaddle = "true";
      script.addEventListener("load", ready, { once: true });
      script.addEventListener(
        "error",
        () => reject(new Error("Paddle.js nu a putut fi încărcat.")),
        { once: true },
      );
      document.head.appendChild(script);
    });
  }
  const paddle = await paddlePromise;
  if (initializedToken && initializedToken !== token)
    throw new Error("Paddle.js a fost inițializat cu alt token client.");
  if (!initializedToken) {
    if (environment === "sandbox") paddle.Environment.set("sandbox");
    paddle.Initialize({ token });
    initializedToken = token;
  }
  return paddle;
}
