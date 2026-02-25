/**
 * app.billing.tsx — Plan selection & billing management
 */
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Button,
  Badge,
  Divider,
  Banner,
  List,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import {
  getMerchantUsage,
  createBillingSubscription,
  PLANS,
} from "../billing.server";
import type { PlanTier } from "../billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const usage = await getMerchantUsage(shop);

  return json({
    plan: usage.plan as PlanTier,
    ordersUsed: usage.ordersImportedThisCycle,
    totalImported: usage.totalOrdersImported,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "upgrade-pro") {
    const confirmationUrl = await createBillingSubscription(admin, shop, "PRO");
    return redirect(confirmationUrl);
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

export default function BillingPage() {
  const { plan, ordersUsed, totalImported } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();

  const isUpgrading = navigation.state === "submitting";
  const isProPlan = plan === "PRO";

  const handleUpgrade = () => {
    const formData = new FormData();
    formData.set("intent", "upgrade-pro");
    submit(formData, { method: "POST" });
  };

  return (
    <Page
      title="Billing"
      backAction={{ content: "Dashboard", url: "/app" }}
    >
      <Layout>
        {isProPlan && (
          <Layout.Section>
            <Banner tone="success" title="You're on the Pro plan">
              <p>Enjoy unlimited order imports every month.</p>
            </Banner>
          </Layout.Section>
        )}

        <Layout.Section>
          <InlineStack gap="400" align="start" wrap={false}>
            {/* Free Plan */}
            <div style={{ flex: 1 }}>
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingMd" as="h2">Free</Text>
                    {plan === "FREE" && <Badge tone="success">Current</Badge>}
                  </InlineStack>
                  <Text variant="heading2xl" as="p">
                    $0
                    <Text as="span" variant="bodySm" tone="subdued"> / month</Text>
                  </Text>
                  <Divider />
                  <List type="bullet">
                    <List.Item>50 order imports per month</List.Item>
                    <List.Item>Auto carrier detection</List.Item>
                    <List.Item>Customer tracking emails</List.Item>
                    <List.Item>Import history</List.Item>
                  </List>
                  {plan === "FREE" && (
                    <Text variant="bodySm" tone="subdued" as="p">
                      {ordersUsed} / 50 imports used this month
                    </Text>
                  )}
                </BlockStack>
              </Card>
            </div>

            {/* Pro Plan */}
            <div style={{ flex: 1 }}>
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="headingMd" as="h2">Pro</Text>
                    {isProPlan ? (
                      <Badge tone="success">Current</Badge>
                    ) : (
                      <Badge tone="info">Recommended</Badge>
                    )}
                  </InlineStack>
                  <Text variant="heading2xl" as="p">
                    $19
                    <Text as="span" variant="bodySm" tone="subdued"> / month</Text>
                  </Text>
                  <Divider />
                  <List type="bullet">
                    <List.Item>
                      <Text as="span" fontWeight="semibold">Unlimited</Text> order imports
                    </List.Item>
                    <List.Item>Auto carrier detection (12+ carriers)</List.Item>
                    <List.Item>Customer tracking emails</List.Item>
                    <List.Item>Import history & error reports</List.Item>
                    <List.Item>Priority support</List.Item>
                  </List>
                  {!isProPlan && (
                    <Button
                      variant="primary"
                      onClick={handleUpgrade}
                      loading={isUpgrading}
                      size="large"
                    >
                      Upgrade to Pro — $19/mo
                    </Button>
                  )}
                </BlockStack>
              </Card>
            </div>
          </InlineStack>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">Usage Summary</Text>
              <Divider />
              <InlineStack gap="600">
                <BlockStack gap="100">
                  <Text variant="heading2xl" as="p">{ordersUsed}</Text>
                  <Text variant="bodySm" tone="subdued" as="p">imports this month</Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text variant="heading2xl" as="p">{totalImported}</Text>
                  <Text variant="bodySm" tone="subdued" as="p">total all time</Text>
                </BlockStack>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
