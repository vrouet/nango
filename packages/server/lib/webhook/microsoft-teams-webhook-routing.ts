import type { WebhookHandler } from './types.js';
import type { LogContextGetter } from '@nangohq/logs';

const route: WebhookHandler = async (nango, integration, _headers, query, body, _rawBody, logContextGetter: LogContextGetter) => {
    const response = await nango.executeScriptForWebhooks(integration, query, body, 'type', 'channelData.tenant.id', logContextGetter, 'tenantId');

    return { parsedBody: body, connectionIds: response?.connectionIds || [] };
};

export default route;
