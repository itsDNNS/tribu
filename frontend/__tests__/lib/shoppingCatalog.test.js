import {parseProduct,groupShoppingItems} from '../../components/shopping/catalog';
test.each([['2 kg Äpfel','Äpfel','2 kg'],['½ l Milch','Milch','0.5 l'],['1/2 kg Zitronen','Zitronen','0.5 kg'],['500g Nudeln','Nudeln','500 g'],['2 Stück Gurke','Gurke','2 Stück']])('parses %s',(query,name,spec)=>{expect(parseProduct(query)).toMatchObject({name,spec});});
test('custom and differently-cased categories remain visible in the stored store order',()=>{
 const groups=groupShoppingItems([{name:'A',category:'Dairy'},{name:'B',category:'dairy'},{name:'C',category:'Custom'}],['Custom','Dairy']);expect(groups.map(g=>g.label)).toEqual(['Custom','Dairy']);expect(groups[1].items).toHaveLength(2);
});

test.each(['1/0 kg Milk','0 g Salt','100000 l Water'])('rejects invalid quantity in %s',query=>{expect(parseProduct(query).invalid).toBe(true);});
