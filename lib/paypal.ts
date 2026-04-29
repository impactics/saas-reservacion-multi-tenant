/**
 * PayPal helper using @paypal/paypal-server-sdk (the new official SDK).
 * Replaces the deprecated @paypal/checkout-server-sdk.
 */
import {
  Client,
  Environment,
  OrdersController,
  CheckoutPaymentIntent,
} from "@paypal/paypal-server-sdk";

function getClient() {
  const clientId = process.env.PAYPAL_CLIENT_ID ?? "";
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET ?? "";
  const env =
    process.env.PAYPAL_ENV === "production"
      ? Environment.Production
      : Environment.Sandbox;

  return new Client({
    clientCredentialsAuthCredentials: { oAuthClientId: clientId, oAuthClientSecret: clientSecret },
    environment: env,
  });
}

export async function createPayPalOrder({
  amount,
  currency,
  bookingId,
  description,
  brandName,
  returnUrl,
  cancelUrl,
}: {
  amount: number;
  currency: string;
  bookingId: string;
  description: string;
  brandName: string;
  returnUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const client = getClient();
  const ordersController = new OrdersController(client);

  const response = await ordersController.ordersCreate({
    body: {
      intent: CheckoutPaymentIntent.Capture,
      purchaseUnits: [
        {
          referenceId: bookingId,
          description,
          amount: {
            currencyCode: currency,
            value: amount.toFixed(2),
          },
          customId: bookingId,
        },
      ],
      paymentSource: {
        paypal: {
          experienceContext: {
            brandName,
            landingPage: "LOGIN",
            userAction: "PAY_NOW",
            returnUrl,
            cancelUrl,
          },
        },
      },
    },
  });

  const orderId = response.result?.id;
  if (!orderId) throw new Error("PayPal did not return an order ID");
  return orderId;
}
