import type { WebhookHandler } from './types.js';
import type { LogContextGetter } from '@nangohq/logs';

const route: WebhookHandler = async (nango, integration, _headers, query, body, _rawBody, logContextGetter: LogContextGetter) => {
    if (Array.isArray(body)) {
        let connectionIds: string[] = [];
        for (const event of body) {
            const response = await nango.executeScriptForWebhooks(
                integration,
                query,
                event,
                'payload.webhookEvent',
                'payload.user.accountId',
                logContextGetter,
                'accountId'
            );
            if (response && response.connectionIds?.length > 0) {
                connectionIds = connectionIds.concat(response.connectionIds);
            }
        }

        return { connectionIds };
    } else {
        return nango.executeScriptForWebhooks(integration, query, body, 'payload.webhookEvent', 'payload.user.accountId', logContextGetter, 'accountId');
    }
};

export default route;
