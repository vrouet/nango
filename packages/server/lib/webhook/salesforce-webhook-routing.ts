import type { WebhookHandler } from './types.js';
import type { LogContextGetter } from '@nangohq/logs';

const route: WebhookHandler = async (nango, integration, _headers, query, body, _rawBody, logContextGetter: LogContextGetter) => {
    return nango.executeScriptForWebhooks(integration, query, body, 'nango.eventType', 'nango.connectionId', logContextGetter, 'connectionId');
};

export default route;
