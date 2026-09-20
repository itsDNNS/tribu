const {test,expect}=require('@playwright/test');
const {mockVisualShopping}=require('../helpers/shopping-visual');
test.use({locale:'de-DE',serviceWorkers:'block'});
async function open(page,options){const api=await mockVisualShopping(page,options);await page.goto('/#shopping');await expect(page.getByRole('heading',{name:'Für alles, was euch fehlt.'})).toBeVisible();await expect(page.getByRole('checkbox',{name:/Äpfel,/}).first()).toBeVisible();return api;}
const tile=(page,name)=>page.getByRole('checkbox',{name:new RegExp(`^${name},`)});

test('quick quantities, detail/photo persistence, move, failure and recipe selection',async({page})=>{
 const api=await open(page);
 await page.getByRole('combobox',{name:'Artikel suchen oder mit Menge hinzufügen'}).fill('2 kg Zitronen');
 await page.getByRole('combobox',{name:'Artikel suchen oder mit Menge hinzufügen'}).press('Enter');
 await expect(tile(page,'Zitronen')).toBeVisible();
 expect(api.items.find(i=>i.name==='Zitronen').spec).toBe('2 kg');
 await page.getByRole('button',{name:'Details zu Zitronen'}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Details für die Familie').fill('Bio, bitte');
 await dialog.getByLabel('Dringlichkeit').selectOption('urgent');
 await dialog.locator('input[type=file]').setInputFiles(require('path').join(__dirname,'../../public/illustrations/meal-lunch.jpg'));
 await expect(dialog.getByAltText('Produktfoto')).toBeVisible();
 api.failNext('/shopping/items/');await dialog.getByRole('button',{name:'Speichern',exact:true}).click();await expect(dialog.getByRole('alert')).toBeVisible();
 await dialog.getByRole('button',{name:'Speichern',exact:true}).click();await expect(dialog).toHaveCount(0);
 await page.reload();await page.getByRole('button',{name:'Details zu Zitronen'}).click();await expect(page.getByLabel('Details für die Familie')).toHaveValue('Bio, bitte');await expect(page.getByLabel('Dringlichkeit')).toHaveValue('urgent');await expect(page.getByAltText('Produktfoto')).toBeVisible();
 await page.getByRole('dialog').getByRole('combobox',{name:'Einkaufsliste',exact:true}).selectOption('2');await page.getByRole('dialog').getByRole('button',{name:'Speichern',exact:true}).click();await expect(tile(page,'Zitronen')).toHaveCount(0);
 await page.getByRole('button',{name:'Zutaten auswählen'}).click();await expect(page.getByRole('dialog').getByRole('checkbox',{name:/Nudeln/})).not.toBeChecked();await expect(page.getByRole('dialog').getByRole('checkbox',{name:/Basilikum/})).toBeChecked();await page.getByRole('button',{name:'Ausgewählte Zutaten hinzufügen'}).click();await expect(tile(page,'Basilikum')).toBeVisible();
});

test('check, Undo, complete, recent reuse and long press',async({page})=>{
 await open(page);await tile(page,'Äpfel').click();await page.getByRole('button',{name:'Rückgängig'}).click();await expect(tile(page,'Äpfel')).not.toBeChecked();
 const apple=tile(page,'Äpfel');const box=await apple.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(600);await page.mouse.up();await expect(page.getByRole('dialog',{name:'Das richtige Lieblingsding.'})).toBeVisible();await page.keyboard.press('Escape');await expect(apple).not.toBeChecked();
 await apple.click();await page.locator('.shop-done summary').click();await page.getByRole('button',{name:'Einkauf abschließen',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Einkauf abschließen',exact:true}).click();await expect(page.locator('.shop-done')).toHaveCount(0);
 await page.reload();await page.locator('.shop-rail').getByRole('button',{name:'Zuletzt',exact:true}).click();await page.locator('.shop-rail').getByRole('button',{name:'Äpfel, hinzufügen',exact:true}).click();await expect(tile(page,'Äpfel')).not.toBeChecked();
});

test('department order is saved per list; text snapshot and display preference persist',async({page})=>{
 await open(page);await page.getByRole('button',{name:'Reihenfolge der Kategorien ändern'}).click();await page.getByRole('button',{name:'Kühlregal nach oben'}).click();await page.getByRole('button',{name:'Reihenfolge speichern'}).click();await page.reload();await expect(page.locator('.shop-category-title').first()).toContainText('Kühlregal');
 await page.getByRole('button',{name:'Listenansicht',exact:true}).click();await page.reload();await expect(page.getByRole('button',{name:'Listenansicht',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Liste weitergeben',exact:true}).click();await expect(page.getByRole('textbox',{name:'Einkaufsliste als Text'})).toContainText('Wocheneinkauf');await page.keyboard.press('Escape');
 await page.locator('.shop-listbar').getByRole('button',{name:/Drogerie/}).click();await expect(page.locator('.shop-category-title').first()).toContainText('Haushalt');
});

for(const width of [320,390,768,1024,1448])test(`visual shopping at ${width}px and focused trip mode`,async({page})=>{
 await page.setViewportSize({width,height:width<800?844:1187});await open(page);await expect(page.locator('.shop-tile').first()).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 if(width===390||width===1448)await page.screenshot({path:test.info().outputPath(`shopping-${width}.png`),fullPage:width>800,animations:'disabled',style:'nextjs-portal{display:none}'});
 await page.locator(width<=680?'.shop-mobile-dock .shop-mode-button':'.shop-list-extra .shop-mode-button').click();await expect(page.getByText('Einkaufsmodus',{exact:true})).toBeVisible();await expect(page.locator('.sidebar')).not.toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 if(width===390)await page.screenshot({path:test.info().outputPath('shopping-trip-390.png'),animations:'disabled',style:'nextjs-portal{display:none}'});
 await page.getByRole('button',{name:'Beenden',exact:true}).click();await page.evaluate(()=>{document.documentElement.setAttribute('data-theme','dark');});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Details zu Äpfel',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.keyboard.press('Escape');
});

test('children can check purchases but cannot modify list or product details',async({page})=>{
 await open(page,{child:true});await expect(page.getByRole('button',{name:'Details zu Äpfel'})).toHaveCount(0);await expect(page.locator('.shop-page').getByRole('button',{name:'Neue Einkaufsliste',exact:true})).toHaveCount(0);await tile(page,'Äpfel').click();await page.locator('.shop-done summary').click();await expect(tile(page,'Äpfel')).toBeChecked();await expect(page.getByRole('button',{name:'Einkauf abschließen',exact:true})).toHaveCount(0);
});
