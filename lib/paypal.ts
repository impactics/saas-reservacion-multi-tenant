import {
  Client,
  Environment,
  OrdersController,
  CheckoutPaymentIntent,
  PaypalExperienceLandingPage,
  PaypalExperienceUserAction,
} from "@paypal/paypal-server-sdk";

function getClient() {
  const env = process.env.PAYPAL_ENV === "production" ? Environment.Production : Environment.Sandbox;
  return new Client({
    clientCredentialsAuthCredentials: {
      oAuthClientId:     process.env.PAYPAL_CLIENT_ID     ?? "",
      oAuthClientSecret: process.env.PAYPAL_CLIENT_SECRET ?? "",
    },
    environment: env,
  });
}

export async function createPayPalOrder({
  amount, currency, bookingId, description, brandName, returnUrl, cancelUrl,
}: {
  amount:      number;
  currency:    string;
  bookingId:   string;
  description: string;
  brandName:   string;
  returnUrl:   string;
  cancelUrl:   string;
}): Promise<string> {
  const ordersController = new OrdersController(getClient());
  const response = await ordersController.ordersCreate({
    body: {
      intent: CheckoutPaymentIntent.Capture,
      purchaseUnits: [{
        referenceId: bookingId,
        description,
        amount: { currencyCode: currency, value: amount.toFixed(2) },
        customId: bookingId,
      }],
      paymentSource: {
        paypal: {
          experienceContext: {
            brandName,
            landingPage: PaypalExperienceLandingPage.Login,
            userAction:  PaypalExperienceUserAction.PayNow,
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
