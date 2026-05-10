
/**
 * Billing Service - Production Implementation
 * Credit management and Stripe integration
 */

import Stripe from 'stripe';
import { prisma } from '../database/client.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-06-20',
});

export class BillingService {
  async deductCredits(tenantId: string, jobId: string, credits: number) {
    // Update tenant credits
    await prisma.tenant.update({
      where: { tenantId },
      data: {
        credits: {
          decrement: credits,
        },
      },
    });

    // Log the charge
    await prisma.metering.create({
      data: {
        jobId,
        tenantId,
        service: 'research',
        credits: credits * 100,
        timestamp: new Date(),
      },
    });
  }

  async getBalance(tenantId: string): Promise<number> {
    const tenant = await prisma.tenant.findUnique({
      where: { tenantId },
    });
    return tenant?.credits || 0;
  }

  async getUsageStats(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({
      where: { tenantId },
      include: { _count: { select: { jobs: true } } },
    });

    if (!tenant) throw new Error('Tenant not found');

    const thisMonthStart = new Date();
    thisMonthStart.setDate(1);
    thisMonthStart.setHours(0, 0, 0, 0);

    const jobsThisMonth = await prisma.researchJob.count({
      where: {
        tenantId,
        createdAt: { gte: thisMonthStart },
      },
    });

    const creditsUsedThisMonth = await prisma.metering.aggregate({
      where: {
        tenantId,
        timestamp: { gte: thisMonthStart },
      },
      _sum: { credits: true },
    });

    return {
      credits_balance: tenant.credits,
      credits_used_this_month: Math.floor((creditsUsedThisMonth._sum.credits || 0) / 100),
      requests_this_month: jobsThisMonth,
      tier: tenant.tier,
      api_calls_per_month: tenant.apiCallsPerMonth,
    };
  }

  async createCheckoutSession(tenantId: string, tier: string, priceId: string) {
    const session = await stripe.checkout.sessions.create({
      customer_email: undefined,
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1,
      }],
      mode: 'subscription',
      success_url: `${process.env.DASHBOARD_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.DASHBOARD_URL}/billing/cancel`,
      metadata: { tenantId, tier },
    });

    return session;
  }

  async handleWebhook(payload: any) {
    const event = payload;

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        await this.processNewSubscription(session);
        break;
      }
      case 'invoice.paid': {
        const invoice = event.data.object;
        await this.processInvoicePaid(invoice);
        break;
      }
    }
  }

  private async processNewSubscription(session: any) {
    const { tenantId, tier } = session.metadata;
    
    await prisma.tenant.update({
      where: { tenantId },
      data: {
        tier,
        stripeCustomerId: session.customer,
        stripeSubscriptionId: session.subscription,
        credits: tier === 'developer' ? 50000 : tier === 'pro' ? 200000 : 0,
      },
    });
  }

  private async processInvoicePaid(invoice: any) {
    // Add monthly credits on renewal
    const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
    const tenant = await prisma.tenant.findFirst({
      where: { stripeSubscriptionId: subscription.id },
    });

    if (tenant) {
      const creditsToAdd = tenant.tier === 'developer' ? 50000 : 
                          tenant.tier === 'pro' ? 200000 : 0;
      
      await prisma.tenant.update({
        where: { tenantId: tenant.tenantId },
        data: {
          credits: { increment: creditsToAdd },
        },
      });
    }
  }
}

export const billingService = new BillingService();
