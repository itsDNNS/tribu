const seed = require('./shopping-visual-seed.json');
async function mockVisualShopping(page, {child=false, empty=false}={}) {
 let items=empty?[]:seed.map((i,n)=>({...i,id:n+1,list_id:i.listId==='weekly'?1:2,spec:`${i.qty} ${i.unit}`,checked:i.done,archived:false,checked_at:i.done?'2026-09-19T18:30:00Z':null,created_at:'2026-09-19T18:30:00Z'}));
 let lists=[{id:1,family_id:7,name:'Wocheneinkauf',icon:'cart',category_order:[]},{id:2,family_id:7,name:'Drogerie',icon:'heart',category_order:[]},{id:3,family_id:7,name:'Wochenende',icon:'coffee',category_order:[]}];
 const requests=[];let failure=null;
 const recipe={id:1,title:'Nudeln mit Tomatensauce',servings:4,ingredients:[{name:'Nudeln',amount:500,unit:'g'},{name:'Basilikum',amount:1,unit:'Bund'}]};
 await page.route('**/api/**',route=>{const request=route.request();const path=new URL(request.url()).pathname.replace(/^\/api/,'');const method=request.method();const body=request.postDataJSON();requests.push({path,method,body});if(failure&&path.includes(failure)){failure=null;return route.fulfill({status:500,contentType:'application/json',body:'{}'});}
 let data=[];
 if(path==='/auth/me')data={id:1,display_name:'Dennis Braun',email:'dennis@example.com',has_completed_onboarding:true};
 else if(path==='/families/me')data=[{family_id:7,family_name:'Familie Braun',role:child?'member':'admin',is_adult:!child}];
 else if(path==='/families/7/members')data=['Dennis','Anna-Lisa','Josephine','Mats'].map((name,n)=>({id:n+1,user_id:n+1,display_name:name,color:'#73518d'}));
 else if(path==='/shopping/lists'&&method==='POST'){data={id:Date.now(),family_id:7,name:body.name,icon:'cart',category_order:[],item_count:0,checked_count:0};lists.push(data);}
 else if(path==='/shopping/lists')data=lists.map(l=>({...l,item_count:items.filter(i=>i.list_id===l.id&&!i.archived).length,checked_count:items.filter(i=>i.list_id===l.id&&i.checked&&!i.archived).length}));
 else if(/^\/shopping\/lists\/\d+$/.test(path)){const id=Number(path.split('/').at(-1));if(method==='DELETE')lists=lists.filter(l=>l.id!==id);else {lists=lists.map(l=>l.id===id?{...l,...body}:l);data=lists.find(l=>l.id===id);}}
 else if(/^\/shopping\/lists\/\d+\/items$/.test(path)){const id=Number(path.split('/')[3]);if(method==='POST'){const existing=items.find(i=>i.list_id===id&&i.name.toLowerCase()===body.name.toLowerCase());if(existing){Object.assign(existing,body,{checked:false,archived:false,checked_at:null});data=existing;}else{data={id:Date.now(),list_id:id,...body,checked:false,checked_at:null,archived:false,created_at:new Date().toISOString()};items.push(data);}}else data=items.filter(i=>i.list_id===id);}
 else if(/^\/shopping\/items\/\d+$/.test(path)){const id=Number(path.split('/').at(-1));if(method==='DELETE')items=items.filter(i=>i.id!==id);else{const item=items.find(i=>i.id===id);Object.assign(item,body);if('checked'in body)item.checked_at=body.checked?new Date().toISOString():null;data=item;}}
 else if(path.endsWith('/complete')){const id=Number(path.split('/')[3]);items=items.map(i=>i.list_id===id&&i.checked?{...i,archived:true}:i);data=items.filter(i=>i.list_id===id&&i.archived);}
 else if(path==='/recipes')data=[recipe];
 else if(path==='/meal-plans')data=[{recipe_id:1}];
 else if(path.endsWith('/add-to-shopping')){for(const ingredient of recipe.ingredients.filter(i=>body.ingredient_names.includes(i.name))){items.push({id:Date.now()+items.length,list_id:body.shopping_list_id,name:ingredient.name,spec:`${ingredient.amount} ${ingredient.unit}`,checked:false,checked_at:null,category:'Obst & Gemüse'});}data={added:body.ingredient_names.length};}
 else if(path==='/dashboard/summary')data={next_events:[],upcoming_birthdays:[]};
 else if(path==='/tasks'||path==='/calendar/events')data={items:[]};
 else if(path==='/nav/order')data={nav_order:['dashboard','calendar','weekly_plan','tasks','shopping','meal_plans','recipes','contacts','settings']};
 else if(path==='/admin/settings/time-format')data={time_format:'24h'};
 else if(path==='/notifications/unread-count')data={count:3};
 else if(path==='/notifications/stream')return route.fulfill({status:200,contentType:'text/event-stream',body:''});
 return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 return {requests,get items(){return items;},failNext:path=>{failure=path;}};
}
module.exports={mockVisualShopping};
