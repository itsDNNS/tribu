import {parseProduct,groupShoppingItems,catalogFor,catalogProduct,productKey} from '../../components/shopping/catalog';
import {SHOP_CATALOG} from '../../lib/shoppingCatalog';
test.each([['2 kg Äpfel','Äpfel','2 kg'],['½ l Milch','Milch','0.5 l'],['1/2 kg Zitronen','Zitronen','0.5 kg'],['500g Nudeln','Nudeln','500 g'],['2 Stück Gurke','Gurke','2 Stück']])('parses %s',(query,name,spec)=>{expect(parseProduct(query)).toMatchObject({name,spec});});
test('custom and differently-cased categories remain visible in the stored store order',()=>{
 const groups=groupShoppingItems([{name:'A',category:'Dairy'},{name:'B',category:'dairy'},{name:'C',category:'Custom'}],['Custom','Dairy']);expect(groups.map(g=>g.label)).toEqual(['Custom','Dairy']);expect(groups[1].items).toHaveLength(2);
});

test.each(['1/0 kg Milk','0 g Salt','100000 l Water'])('rejects invalid quantity in %s',query=>{expect(parseProduct(query).invalid).toBe(true);});

// #562: the catalogue speaks German to German readers and English otherwise.
test.each([['2 kg apples','en','Apples','2 kg'],['Milk','en','Milk','1 l'],['Milch','en','Milk','1 l'],['Milk','de','Milch','1 l'],['bananas','fr','Bananas','6'],['2 cans chopped tomatoes','en','Chopped tomatoes','2 cans']])('parses %s for %s readers',(query,lang,name,spec)=>{
 expect(parseProduct(query,lang)).toMatchObject({name,spec,category:expect.any(String)});
});
test('English names keep the stored German category',()=>{
 expect(parseProduct('Salmon','en').category).toBe('Fleisch & Fisch');
 expect(catalogProduct('Chicken breast','en')).toMatchObject({name:'Chicken breast',category:'Fleisch & Fisch',art:'meat'});
});
test('every product has an English name and the catalogue lists it by language',()=>{
 expect(SHOP_CATALOG.every(p=>p.nameEn&&p.nameDe)).toBe(true);
 expect(catalogFor('en').map(p=>p.name)).toContain('Mineral water');
 expect(catalogFor('de').map(p=>p.name)).toContain('Mineralwasser');
 expect(catalogFor('en').find(p=>p.id==='water').aliases).toContain('Mineralwasser');
});
test('a product has one key in both languages, the German one for saved favourites',()=>{
 expect(productKey('Milk')).toBe('milch');
 expect(productKey('Milch')).toBe('milch');
 expect(productKey('Kokosdrink')).toBe('kokosdrink');
});
