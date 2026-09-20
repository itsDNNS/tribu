const {test,expect}=require('../helpers/fixtures');
const {getFamilyId,seedShoppingList,seedShoppingItem,seedShoppingTemplate,seedShoppingStoreLink}=require('../helpers/api-setup');
const {navigateTo}=require('../helpers/navigation');
const {shoppingListCard,selectShoppingList}=require('../helpers/shopping');
test.use({serviceWorkers:'block'});
const tile=(page,name)=>page.getByRole('checkbox',{name:new RegExp(`^${name},`)});
const search=page=>page.getByRole('combobox',{name:'Search products or add with a quantity'});
async function openList(page,name){await page.reload();await navigateTo(page,'Shopping');await selectShoppingList(page,name);}
async function menu(page){await page.locator('.shop-page').getByRole('button',{name:'List options',exact:true}).first().click();}
async function templates(page){await menu(page);await page.getByRole('dialog').getByRole('button',{name:'Shopping templates',exact:true}).click();}

test.describe('Shopping with the backend',()=>{
 test.setTimeout(60000);
 test('create a shopping list',async({authedPage:page})=>{await navigateTo(page,'Shopping');await page.getByRole('button',{name:'New shopping list',exact:true}).click();await page.getByRole('dialog').getByLabel('List name').fill('E2E Groceries');await page.getByRole('dialog').getByRole('button',{name:'Save',exact:true}).click();await expect(shoppingListCard(page,'E2E Groceries')).toBeVisible();});
 test('add quantity and notes, rename a list and move the product',async({authedPage:page,apiCtx})=>{
  const family=await getFamilyId(apiCtx);await seedShoppingList(apiCtx,family,'Source Store');await seedShoppingList(apiCtx,family,'Target Store');await openList(page,'Source Store');
  await search(page).fill('2 kg Bread');await search(page).press('Enter');await expect(tile(page,'Bread')).toBeVisible();
  await page.getByRole('button',{name:'Details for Bread'}).click();const d=page.getByRole('dialog');await d.getByLabel('Details for the family').fill('Whole wheat');await d.getByRole('combobox',{name:'Category',exact:true}).selectOption('__custom__');await d.getByRole('textbox',{name:'Custom category',exact:true}).fill('Bakery aisle');await d.getByRole('button',{name:'Save',exact:true}).click();await expect(tile(page,'Bread')).toContainText('Whole wheat');
  await menu(page);await page.getByRole('button',{name:'Edit list',exact:true}).click();await page.getByRole('dialog').getByLabel('List name').fill('Renamed Source');await page.getByRole('dialog').getByRole('button',{name:'Save',exact:true}).click();await expect(shoppingListCard(page,'Renamed Source')).toBeVisible();
  await page.getByRole('button',{name:'Details for Bread'}).click();await page.getByRole('dialog').getByRole('combobox',{name:'Shopping list',exact:true}).selectOption({label:'Target Store'});await page.getByRole('dialog').getByRole('button',{name:'Save',exact:true}).click();await expect(tile(page,'Bread')).toHaveCount(0);await selectShoppingList(page,'Target Store');await expect(tile(page,'Bread')).toContainText('2 kg');await expect(page.getByRole('region',{name:'Bakery aisle',exact:true})).toBeVisible();
 });
 test('check, Undo, archive and restore retain a single product',async({authedPage:page,apiCtx})=>{
  const family=await getFamilyId(apiCtx);const list=await seedShoppingList(apiCtx,family,'Trip History');await seedShoppingItem(apiCtx,list.id,'Milk','2 l','Dairy');await openList(page,'Trip History');await tile(page,'Milk').click();await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(tile(page,'Milk')).not.toBeChecked();await tile(page,'Milk').click();await page.locator('.shop-done summary').click();await page.getByRole('button',{name:'Complete shopping',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Complete shopping',exact:true}).click();await expect(tile(page,'Milk')).toHaveCount(0);
  await page.reload();await selectShoppingList(page,'Trip History');await search(page).fill('milk');await search(page).press('Enter');await expect(tile(page,'Milk')).toHaveCount(1);await expect(tile(page,'Milk')).not.toBeChecked();
 });
 test('department order is persisted for the selected list',async({authedPage:page,apiCtx})=>{
  const family=await getFamilyId(apiCtx);const list=await seedShoppingList(apiCtx,family,'Department Order');await seedShoppingItem(apiCtx,list.id,'Bread','1','Bakery');await seedShoppingItem(apiCtx,list.id,'Milk','2 l','Dairy');await openList(page,'Department Order');await menu(page);await page.getByRole('button',{name:'Department order',exact:true}).click();await page.getByRole('button',{name:'Dairy move up',exact:true}).click();await page.getByRole('button',{name:'Save order',exact:true}).click();await page.reload();await selectShoppingList(page,'Department Order');await expect(page.locator('.shop-category-title').first()).toContainText('Dairy');
 });
 test('create, edit and apply a shopping template',async({authedPage:page,apiCtx})=>{
  const family=await getFamilyId(apiCtx);await seedShoppingList(apiCtx,family,'Template Target');await openList(page,'Template Target');await templates(page);await page.getByRole('button',{name:'New template',exact:true}).click();await page.getByPlaceholder('e.g. Weekly groceries').fill('Weekly basics');await page.getByPlaceholder('Template item',{exact:true}).fill('Milk');await page.getByPlaceholder('Amount/details').fill('2 L');await page.getByPlaceholder('Category',{exact:true}).fill('Dairy');await page.getByRole('button',{name:'Save template'}).click();await page.getByRole('button',{name:'Edit template: Weekly basics'}).click();await page.getByPlaceholder('e.g. Weekly groceries').fill('Breakfast');await page.getByRole('button',{name:'Save template'}).click();await page.getByRole('button',{name:'Add to list: Breakfast'}).click();await expect(tile(page,'Milk')).toContainText('2 L');
 });
 test('apply a saved template',async({authedPage:page,apiCtx})=>{
  const family=await getFamilyId(apiCtx);await seedShoppingList(apiCtx,family,'Saved Template Target');await seedShoppingTemplate(apiCtx,family,'Saved basics',[{name:'Oats',spec:'1 kg',category:'Pantry'}]);await openList(page,'Saved Template Target');await templates(page);await page.getByRole('button',{name:'Add to list: Saved basics'}).click();await expect(tile(page,'Oats')).toBeVisible();
 });
 test('store search opens a native link without checking the product',async({authedPage:page,apiCtx})=>{
  const family=await getFamilyId(apiCtx);const list=await seedShoppingList(apiCtx,family,'Store Search');await seedShoppingItem(apiCtx,list.id,'Bread');const base=process.env.BASE_URL||'http://localhost:3000';const store=await seedShoppingStoreLink(apiCtx,family,'E2E Store',`${base}/?q={query}`);
  try{await openList(page,'Store Search');await page.getByRole('button',{name:'Details for Bread'}).click();await page.getByRole('dialog').getByRole('button',{name:'Search online'}).click();const link=page.getByRole('link',{name:/E2E Store/});const [popup]=await Promise.all([page.context().waitForEvent('page'),link.click()]);await popup.waitForLoadState('domcontentloaded');expect(popup.url()).toContain('q=Bread');expect(await popup.evaluate(()=>window.opener)).toBeNull();expect(await popup.evaluate(()=>document.referrer)).toBe('');await popup.close();await expect(tile(page,'Bread')).not.toBeChecked();}finally{await apiCtx.delete(`/api/shopping/store-links/${store.id}`);}
 });
 test('delete a list only after confirmation',async({authedPage:page,apiCtx})=>{
  const family=await getFamilyId(apiCtx);await seedShoppingList(apiCtx,family,'Delete This List');await openList(page,'Delete This List');await menu(page);await page.getByRole('button',{name:'Delete list',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Delete',exact:true}).click();await expect(shoppingListCard(page,'Delete This List')).toHaveCount(0);
 });
 test('mobile trip mode has a clear checklist and hides navigation',async({authedPage:page,apiCtx})=>{
  await page.setViewportSize({width:390,height:844});const family=await getFamilyId(apiCtx);const list=await seedShoppingList(apiCtx,family,'Mobile Market');await seedShoppingItem(apiCtx,list.id,'Apples','6','Produce');await openList(page,'Mobile Market');await search(page).focus();await tile(page,'Apples').click();await expect(search(page)).not.toBeFocused();await page.locator('.shop-mobile-dock .shop-mode-button').click();await expect(page.getByText('Shopping mode',{exact:true})).toBeVisible();await expect(page.locator('.sidebar')).not.toBeVisible();await expect(page.locator('.bottom-nav')).not.toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
});
