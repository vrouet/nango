import type { WebhookHandler } from './types.js';
import { getLogger } from '@nangohq/utils';

import crypto from 'crypto';
import type { LogContextGetter } from '@nangohq/logs';

const logger = getLogger('Webhook.StripeApp');

function validate(headerSignature: string, body: string): boolean {
    const secret = 'whsec_iVwrUJvphw7RjoRb2K7uuGeLGS1jXylc';

    const splitSignature = headerSignature.split(',');
    if (splitSignature.length < 2) {
        logger.error('Invalid signature format');
        return false;
    }

    const timestamp = splitSignature.find((part) => part.startsWith('t='))?.split('=')[1];

    if (!timestamp) {
        logger.error('Timestamp not found');
        return false;
    }

    const signedPayload = `${timestamp}.${body}`;
    const signature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

    const stripeSignature = splitSignature.find((part) => part.startsWith('v1='))?.split('=')[1];

    if (!stripeSignature) {
        logger.error('Stripe signature not found');
        return false;
    }

    const trusted = Buffer.from(signature, 'ascii');
    const untrusted = Buffer.from(stripeSignature, 'ascii');

    try {
        return crypto.timingSafeEqual(trusted, untrusted);
    } catch (e) {
        logger.error(e);
        return false;
    }
}

const route: WebhookHandler = async (nango, integration, headers, query, body, rawBody, logContextGetter: LogContextGetter) => {
    const signature = headers['stripe-signature'] as string | undefined;
    if (!signature) {
        logger.error('Signature not found');
        return;
    }

    logger.info('Signature found, verifying...');
    const valid = validate(signature, rawBody);

    if (!valid) {
        logger.error('Stripe App webhook signature invalid');
        return;
    }

    return nango.executeScriptForWebhooks(integration, query, body, 'type', 'connectionId', logContextGetter, 'connectionId');
};

export default route;
