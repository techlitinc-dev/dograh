"use client";

import {
  Check,
  CreditCard,
  Sparkles,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  createCheckoutSessionApiV1BillingCheckoutPost,
  createCustomerPortalApiV1BillingPortalPost,
  getSubscriptionApiV1BillingSubscriptionGet,
} from "@/client/sdk.gen";
import type { SubscriptionResponse } from "@/client/types.gen";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { detailFromError } from "@/lib/apiError";
import { useAuth } from "@/lib/auth";

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: 49,
    period: "/month",
    description: "For startups & teams launching their first voice agent.",
    voiceMinutes: "500 mins",
    contacts: "2,500 contacts",
    seats: "2 seats",
    features: [
      "500 Voice AI Minutes / month",
      "Up to 2,500 CRM Contacts",
      "Full Visual Agent Builder Canvas",
      "Inbound Telephony & WebRTC",
      "Basic Analytics & Transcripts",
      "2 Team Members",
    ],
    popular: false,
  },
  {
    id: "growth",
    name: "Growth",
    price: 199,
    period: "/month",
    description: "For scaling businesses automating customer calls & CRM.",
    voiceMinutes: "2,500 mins",
    contacts: "25,000 contacts",
    seats: "5 seats",
    features: [
      "2,500 Voice AI Minutes / month",
      "25,000 CRM Contacts & Segments",
      "Autonomous Outbound Campaigns",
      "Full CRM Deals Pipeline & Kanban",
      "Mid-Call Tool & CRM API Actions",
      "Webhooks & Integration Triggers",
      "5 Team Members",
    ],
    popular: true,
  },
  {
    id: "scale",
    name: "Scale",
    price: 499,
    period: "/month",
    description: "High-volume voice operations and dedicated infrastructure.",
    voiceMinutes: "8,000 mins",
    contacts: "100,000 contacts",
    seats: "15 seats",
    features: [
      "8,000 Voice AI Minutes / month",
      "100,000 Contacts & Full Audit Log",
      "Unlimited Concurrent Call Slots",
      "Custom Fine-Tuning & Prompt Guard",
      "Dedicated High-QoS Telephony Trunks",
      "15 Team Members",
      "Priority SLA Support",
    ],
    popular: false,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 1499,
    period: "/month",
    description: "Custom compliance, SLA, and dedicated engineering.",
    voiceMinutes: "30,000+ mins",
    contacts: "500,000+ contacts",
    seats: "100+ seats",
    features: [
      "30,000+ Voice AI Minutes / month",
      "Custom Telephony / BYO SIP Trunk",
      "SOC2 / HIPAA / GDPR Compliance Pack",
      "Custom 99.99% Availability SLA",
      "Unlimited Seats & SSO / SAML",
      "24/7 Dedicated Account Manager",
    ],
    popular: false,
  },
];

export default function BillingPage() {
  const { user, redirectToLogin, loading: authLoading } = useAuth();

  const [subscription, setSubscription] = useState<SubscriptionResponse | null>(null);
  const [, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      redirectToLogin();
    }
  }, [authLoading, user, redirectToLogin]);

  const fetchSubscription = async () => {
    try {
      setIsLoading(true);
      const res = await getSubscriptionApiV1BillingSubscriptionGet();
      if (!res.error) {
        setSubscription(res.data ?? null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading || !user) return;
    fetchSubscription();
  }, [authLoading, user]);

  const handleCheckout = async (planId: string) => {
    try {
      setIsProcessing(true);
      const res = await createCheckoutSessionApiV1BillingCheckoutPost({
        body: {
          plan: planId,
          success_url: window.location.origin + "/billing?success=true",
          cancel_url: window.location.origin + "/billing?canceled=true",
        },
      });

      if (res.error) {
        toast.error(detailFromError(res.error, "Failed to initiate checkout"));
        return;
      }
      if (res.data?.checkout_url) {
        window.location.href = res.data.checkout_url;
      }
    } catch {
      toast.error("Checkout request failed");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManagePortal = async () => {
    try {
      setIsProcessing(true);
      const res = await createCustomerPortalApiV1BillingPortalPost();
      if (res.error) {
        toast.error(detailFromError(res.error, "Failed to open billing portal"));
        return;
      }
      if (res.data?.portal_url) {
        window.location.href = res.data.portal_url;
      }
    } catch {
      toast.error("Failed to open billing portal");
    } finally {
      setIsProcessing(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="container mx-auto px-6 py-8 space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-44 rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-96 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  const currentPlan = subscription?.plan || "free";

  return (
    <div className="container mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Billing & Subscriptions</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your plan, voice minute quotas, seats, and payment methods.
          </p>
        </div>
        <Button
          variant="outline"
          className="glass-button gap-2 border-white/10"
          onClick={handleManagePortal}
          disabled={isProcessing}
        >
          <CreditCard className="h-4 w-4" />
          Manage Stripe Portal
        </Button>
      </div>

      {/* Current Plan Overview Card */}
      <div className="glass-card rounded-2xl p-6 sm:p-8 relative overflow-hidden border border-white/10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">Active Subscription</span>
              <Badge variant="outline" className="capitalize bg-primary/10 text-primary border-primary/20">
                {currentPlan} Plan
              </Badge>
            </div>
            <div className="text-2xl font-bold tracking-tight mt-1 capitalize">
              {currentPlan === "free" ? "Free Community Tier" : `VoxCRM ${currentPlan} Tier`}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {subscription?.current_period_end
                ? `Next billing cycle renews on ${new Date(subscription.current_period_end).toLocaleDateString()}`
                : "Metered voice usage active on organization account"}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className="text-xs text-muted-foreground">Assigned Seats</span>
              <div className="text-lg font-bold">{subscription?.seats ?? 1} Users</div>
            </div>
          </div>
        </div>
      </div>

      {/* Pricing Plan Selector */}
      <div className="space-y-4">
        <div className="text-center max-w-xl mx-auto space-y-2">
          <h2 className="text-2xl font-bold tracking-tight">Choose the Plan That Scales With You</h2>
          <p className="text-xs text-muted-foreground">
            Upgrade anytime to unlock higher voice quotas, native CRM automations, and dedicated telephony.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 pt-4">
          {PLANS.map((plan) => {
            const isCurrent = currentPlan.toLowerCase() === plan.id;
            return (
              <div
                key={plan.id}
                className={`glass-card rounded-2xl p-6 flex flex-col justify-between relative transition-all duration-200 ${
                  plan.popular
                    ? "border-primary/50 shadow-xl shadow-primary/10 bg-card/60"
                    : "border-white/10 hover:border-white/20"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-md">
                    <Sparkles className="h-3 w-3" /> Most Popular
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <h3 className="font-bold text-lg text-foreground">{plan.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1 min-h-[32px]">{plan.description}</p>
                  </div>

                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold tracking-tight">${plan.price}</span>
                    <span className="text-xs text-muted-foreground font-medium">{plan.period}</span>
                  </div>

                  <div className="pt-2 border-t border-white/5 space-y-2 text-xs">
                    <div className="font-semibold text-foreground/90 flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5 text-primary" /> {plan.voiceMinutes}
                    </div>
                    {plan.features.map((feat, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-muted-foreground">
                        <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-6">
                  {isCurrent ? (
                    <Button variant="outline" disabled className="w-full rounded-xl text-xs border-primary/30">
                      Current Plan
                    </Button>
                  ) : (
                    <Button
                      className={`w-full rounded-xl text-xs font-semibold ${
                        plan.popular
                          ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
                          : "glass-button"
                      }`}
                      onClick={() => handleCheckout(plan.id)}
                      disabled={isProcessing}
                    >
                      {isProcessing ? "Redirecting..." : `Upgrade to ${plan.name}`}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
