"""FastAPI router for Commercial SaaS Billing, Stripe Checkout & Webhooks."""

import os
from datetime import datetime, UTC
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from loguru import logger
from pydantic import BaseModel
from sqlalchemy import select

from api.db.base_client import BaseDBClient
from api.db.models import OrganizationModel, SubscriptionModel, UserModel
from api.enums import PlanTier
from api.schemas.crm import (
    CheckoutSessionRequest,
    CheckoutSessionResponse,
    CustomerPortalResponse,
    SubscriptionResponse,
)
from api.services.auth.depends import get_user_with_selected_organization

router = APIRouter(prefix="/billing", tags=["billing"])

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")

PLAN_DETAILS = {
    "starter": {
        "name": "Starter",
        "price_usd_monthly": 49,
        "price_usd_annual": 39,
        "voice_minutes": 500,
        "contacts_limit": 2500,
        "seats": 2,
        "features": [
            "500 Voice AI Minutes / month",
            "Up to 2,500 CRM Contacts",
            "Full Voice Pipeline & Agent Canvas",
            "Native WebRTC & Inbound SIP",
            "2 Team Seats",
            "Email Support",
        ],
    },
    "growth": {
        "name": "Growth",
        "price_usd_monthly": 199,
        "price_usd_annual": 159,
        "voice_minutes": 2500,
        "contacts_limit": 25000,
        "seats": 5,
        "features": [
            "2,500 Voice AI Minutes / month",
            "Up to 25,000 CRM Contacts",
            "Autonomous Outbound Campaigns",
            "Full CRM Kanban & Deals Pipeline",
            "Mid-Call CRM Tool Execution",
            "5 Team Seats",
            "Priority Support & Webhooks",
        ],
    },
    "scale": {
        "name": "Scale",
        "price_usd_monthly": 499,
        "price_usd_annual": 399,
        "voice_minutes": 8000,
        "contacts_limit": 100000,
        "seats": 15,
        "features": [
            "8,000 Voice AI Minutes / month",
            "100,000 CRM Contacts",
            "Unlimited Concurrent Voice Channels",
            "Dedicated High-QoS Telephony Trunks",
            "Custom LLM Fine-Tuning & Prompt Guard",
            "15 Team Seats",
            "Dedicated Account Manager",
        ],
    },
    "enterprise": {
        "name": "Enterprise",
        "price_usd_monthly": 1499,
        "price_usd_annual": 1199,
        "voice_minutes": 30000,
        "contacts_limit": 500000,
        "seats": 100,
        "features": [
            "Volume Voice Pricing (<$0.05/min)",
            "Unlimited Contacts & Segments",
            "Custom Telephony / BYO SIP Trunk",
            "SOC2 / HIPAA / GDPR Compliance Pack",
            "Custom SLA (99.99%)",
            "100+ Team Seats",
            "24/7 Phone & Engineering Escalation",
        ],
    },
}


@router.get("/plans")
async def get_plans():
    """Get available commercial subscription tiers and feature matrices."""
    return {"plans": PLAN_DETAILS}


@router.get("/subscription", response_model=SubscriptionResponse)
async def get_subscription(
    user: UserModel = Depends(get_user_with_selected_organization),
) -> SubscriptionResponse:
    """Retrieve current subscription status for active organization."""
    org_id = user.selected_organization_id
    db = BaseDBClient()

    async with db.async_session() as session:
        result = await session.execute(
            select(SubscriptionModel).where(SubscriptionModel.organization_id == org_id)
        )
        sub = result.scalar_one_or_none()

        if not sub:
            return SubscriptionResponse(
                plan=PlanTier.FREE.value,
                status="active",
                seats=1,
                current_period_end=None,
                trial_ends_at=None,
                is_active=True,
            )

        is_active = sub.status in ("active", "trialing")
        return SubscriptionResponse(
            plan=sub.plan,
            status=sub.status,
            seats=sub.seats,
            current_period_end=sub.current_period_end,
            trial_ends_at=sub.trial_ends_at,
            is_active=is_active,
        )


@router.post("/checkout", response_model=CheckoutSessionResponse)
async def create_checkout_session(
    payload: CheckoutSessionRequest,
    user: UserModel = Depends(get_user_with_selected_organization),
) -> CheckoutSessionResponse:
    """Create a Stripe Checkout Session for plan upgrade/subscription."""
    org_id = user.selected_organization_id
    plan_key = payload.plan.lower()

    if plan_key not in PLAN_DETAILS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid plan '{payload.plan}'. Must be one of: {list(PLAN_DETAILS.keys())}",
        )

    if not STRIPE_SECRET_KEY:
        # In self-hosted OSS or sandbox mode without Stripe key, activate plan directly for testing
        logger.info(f"Stripe not configured; upgrading org {org_id} to plan {plan_key} in test mode.")
        db = BaseDBClient()
        async with db.async_session() as session:
            result = await session.execute(
                select(SubscriptionModel).where(SubscriptionModel.organization_id == org_id)
            )
            sub = result.scalar_one_or_none()
            if not sub:
                sub = SubscriptionModel(
                    organization_id=org_id,
                    plan=plan_key,
                    status="active",
                    seats=PLAN_DETAILS[plan_key]["seats"],
                )
                session.add(sub)
            else:
                sub.plan = plan_key
                sub.status = "active"
                sub.seats = PLAN_DETAILS[plan_key]["seats"]
            await session.commit()

        return CheckoutSessionResponse(
            checkout_url=payload.success_url,
            session_id=f"demo_sess_{org_id}_{plan_key}",
        )

    try:
        import stripe
        stripe.api_key = STRIPE_SECRET_KEY

        checkout_session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[
                {
                    "price_data": {
                        "currency": "usd",
                        "product_data": {
                            "name": f"Auravox {PLAN_DETAILS[plan_key]['name']} Plan",
                            "description": f"AI Voice Platform + CRM SaaS ({PLAN_DETAILS[plan_key]['voice_minutes']} mins/mo)",
                        },
                        "unit_amount": PLAN_DETAILS[plan_key]["price_usd_monthly"] * 100,
                        "recurring": {"interval": "month"},
                    },
                    "quantity": 1,
                }
            ],
            mode="subscription",
            success_url=payload.success_url + "?session_id={CHECKOUT_SESSION_ID}",
            cancel_url=payload.cancel_url,
            client_reference_id=str(org_id),
            customer_email=user.email,
            metadata={"organization_id": str(org_id), "plan": plan_key},
        )

        return CheckoutSessionResponse(
            checkout_url=checkout_session.url,
            session_id=checkout_session.id,
        )
    except Exception as e:
        logger.error(f"Stripe checkout creation error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Payment provider error: {str(e)}",
        )


@router.post("/portal", response_model=CustomerPortalResponse)
async def create_customer_portal(
    user: UserModel = Depends(get_user_with_selected_organization),
) -> CustomerPortalResponse:
    """Create Stripe Customer Portal session for managing payment method / invoices."""
    org_id = user.selected_organization_id
    db = BaseDBClient()

    if not STRIPE_SECRET_KEY:
        return CustomerPortalResponse(portal_url="/billing")

    async with db.async_session() as session:
        result = await session.execute(
            select(SubscriptionModel).where(SubscriptionModel.organization_id == org_id)
        )
        sub = result.scalar_one_or_none()
        if not sub or not sub.stripe_customer_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No Stripe customer found for this organization",
            )

        import stripe
        stripe.api_key = STRIPE_SECRET_KEY
        portal_session = stripe.billing_portal.Session.create(
            customer=sub.stripe_customer_id,
            return_url="/billing",
        )
        return CustomerPortalResponse(portal_url=portal_session.url)


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: Optional[str] = Header(None, alias="stripe-signature"),
):
    """Handle incoming Stripe webhook events (subscriptions, renewals, cancellations)."""
    payload = await request.body()

    if not STRIPE_SECRET_KEY or not STRIPE_WEBHOOK_SECRET:
        logger.warning("Stripe webhook invoked but secret key or webhook secret is not set")
        return {"received": True}

    import stripe
    stripe.api_key = STRIPE_SECRET_KEY

    try:
        event = stripe.Webhook.construct_event(
            payload, stripe_signature, STRIPE_WEBHOOK_SECRET
        )
    except Exception as e:
        logger.error(f"Stripe webhook signature verification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid webhook signature",
        )

    event_type = event["type"]
    data_object = event["data"]["object"]
    db = BaseDBClient()

    logger.info(f"Stripe webhook event received: {event_type}")

    if event_type == "checkout.session.completed":
        org_id_str = data_object.get("client_reference_id") or data_object.get("metadata", {}).get("organization_id")
        plan = data_object.get("metadata", {}).get("plan", "starter")
        customer_id = data_object.get("customer")
        subscription_id = data_object.get("subscription")

        if org_id_str:
            org_id = int(org_id_str)
            async with db.async_session() as session:
                result = await session.execute(
                    select(SubscriptionModel).where(SubscriptionModel.organization_id == org_id)
                )
                sub = result.scalar_one_or_none()
                if not sub:
                    sub = SubscriptionModel(
                        organization_id=org_id,
                        stripe_customer_id=customer_id,
                        stripe_subscription_id=subscription_id,
                        plan=plan,
                        status="active",
                        seats=PLAN_DETAILS.get(plan, {}).get("seats", 2),
                    )
                    session.add(sub)
                else:
                    sub.stripe_customer_id = customer_id
                    sub.stripe_subscription_id = subscription_id
                    sub.plan = plan
                    sub.status = "active"
                    sub.seats = PLAN_DETAILS.get(plan, {}).get("seats", 2)
                await session.commit()
                logger.info(f"Organization {org_id} upgraded to {plan} via checkout")

    elif event_type in ("customer.subscription.updated", "customer.subscription.deleted"):
        subscription_id = data_object.get("id")
        status_val = data_object.get("status")
        period_end = data_object.get("current_period_end")

        async with db.async_session() as session:
            result = await session.execute(
                select(SubscriptionModel).where(
                    SubscriptionModel.stripe_subscription_id == subscription_id
                )
            )
            sub = result.scalar_one_or_none()
            if sub:
                sub.status = status_val
                if period_end:
                    sub.current_period_end = datetime.fromtimestamp(period_end, tz=UTC)
                if event_type == "customer.subscription.deleted":
                    sub.plan = PlanTier.FREE.value
                await session.commit()
                logger.info(f"Subscription {subscription_id} updated to status {status_val}")

    return {"status": "success"}
