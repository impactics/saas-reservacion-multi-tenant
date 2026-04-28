/**
 * Minimal type declaration for @paypal/checkout-server-sdk.
 * The package ships no TypeScript types and there is no @types package available.
 * These declarations cover the subset used in app/api/[slug]/checkout/route.ts.
 */
declare module "@paypal/checkout-server-sdk" {
  namespace core {
    class SandboxEnvironment {
      constructor(clientId: string, clientSecret: string);
    }
    class LiveEnvironment {
      constructor(clientId: string, clientSecret: string);
    }
    class PayPalHttpClient {
      constructor(environment: SandboxEnvironment | LiveEnvironment);
      execute(request: unknown): Promise<{ result: Record<string, unknown> }>;
    }
  }

  namespace orders {
    class OrdersCreateRequest {
      prefer(preference: string): void;
      requestBody(body: Record<string, unknown>): void;
    }
    class OrdersCaptureRequest {
      constructor(orderId: string);
      requestBody(body: Record<string, unknown>): void;
    }
  }

  export { core, orders };
  const _default: { core: typeof core; orders: typeof orders };
  export default _default;
}
