import type { estypes } from '@elastic/elasticsearch';
import { indexMessages } from '../es/schema.js';
import { client } from '../es/client.js';
import type { InsightsHistogramEntry } from '@nangohq/types';

export async function retrieveInsights(opts: { accountId: number; environmentId: number; type: string }) {
    const query: estypes.QueryDslQueryContainer = {
        bool: {
            must: [{ term: { accountId: opts.accountId } }, { term: { environmentId: opts.environmentId } }, { term: { 'operation.type': opts.type } }],
            must_not: { exists: { field: 'parentId' } },
            should: []
        }
    };

    const res = await client.search<
        never,
        {
            histogram: estypes.AggregationsDateHistogramAggregate;
        }
    >({
        index: indexMessages.index,
        size: 0,
        sort: [{ createdAt: 'desc' }, 'id'],
        track_total_hits: true,
        aggs: {
            histogram: {
                date_histogram: { field: 'createdAt', calendar_interval: '1d', format: 'yyyy-MM-dd' },
                aggs: {
                    state_agg: {
                        terms: { field: 'state' }
                    }
                }
            }
        },
        query
    });

    const agg = res.aggregations!['histogram'];

    const computed: InsightsHistogramEntry[] = [];
    for (const item of agg.buckets as any[]) {
        const success = (item.state_agg.buckets as { key: string; doc_count: number }[]).find((i) => i.key === 'success');
        const failure = (item.state_agg.buckets as { key: string; doc_count: number }[]).find((i) => i.key === 'failed');
        computed.push({ key: item.key_as_string, total: item.doc_count, success: success?.doc_count || 0, failure: failure?.doc_count || 0 });
    }

    return {
        items: computed
    };
}
