import { shareNextProperty } from '../src/services/property_sharing';

const DEALS = [
    { id: '3196cedb-a712-4c9a-befd-050efbb40727', phone: '+919810213551', loc: 'Ghaziabad' },
    { id: 'b2b1a932-a8c5-45f9-91c5-52601931fe7b', phone: '+918890226686', loc: 'Ghaziabad' },
    { id: '1352155c-53a9-4c01-b9fe-b6bd880fa4f7', phone: '+918882390004', loc: 'Ghaziabad' },
    { id: '1c68099e-f395-4065-b7fa-61c88a6437b5', phone: '+919654614173', loc: 'Vaishali' },
    { id: 'de83a070-ac03-4032-979e-95a11adcd594', phone: '+919428828493', loc: 'Vaishali' },
    { id: '0646d132-687e-4a39-8289-f201695b4360', phone: '+917303053430', loc: 'Ghaziabad' },
    { id: '7417550a-cb6c-48ea-82e1-5813ebaef3a1', phone: '+917703866612', loc: 'Vaishali' },
];

async function main() {
    for (const d of DEALS) {
        try {
            const result = await shareNextProperty(d.id);
            if (result) {
                console.log('SHARED  ' + d.phone + ' (' + d.loc + ') → ' + result);
            } else {
                console.log('NOMATCH ' + d.phone + ' (' + d.loc + ')');
            }
        } catch (e: any) {
            console.error('ERROR   ' + d.phone + ' (' + d.loc + ') — ' + e.message);
        }
    }
    process.exit(0);
}
main();
