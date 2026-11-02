import { expect, it } from 'vitest';
import { inventoryPriceLabels } from '../utils/format_price';
it('keeps authorized demand and display labels separate without multiplying dual columns by legacy units', () => {
    expect(inventoryPriceLabels({ customer_price: 4000000, display_price: 4200000, price: 40, price_unit: 'Lakh', intent: 'sell' })).toEqual({ formatted_demand_price: '₹40 Lakh', formatted_display_price: '₹42 Lakh' });
    expect(inventoryPriceLabels({ price: 40, price_unit: 'Lakh', display_price: null, intent: 'sell' })).toEqual({ formatted_demand_price: '₹40 Lakh', formatted_display_price: 'Price on request' });
    expect(inventoryPriceLabels({ display_price: 0 }).formatted_demand_price).toBeUndefined();
    expect(inventoryPriceLabels({ customer_price: 0, display_price: 25000, intent: 'rent' })).toEqual({ formatted_demand_price: 'Price on request', formatted_display_price: '₹25,000/month' });
});
