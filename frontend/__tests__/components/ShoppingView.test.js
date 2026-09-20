import {fireEvent,render,screen,waitFor,within,act} from '@testing-library/react';
import '@testing-library/jest-dom';
import ShoppingView from '../../components/ShoppingView';
import {buildMessages} from '../../lib/i18n';
let mockApp, mockShopping;
jest.mock('../../contexts/AppContext',()=>({useApp:()=>mockApp}));
jest.mock('../../hooks/useShopping',()=>({useShopping:()=>mockShopping}));
jest.mock('../../contexts/ToastContext',()=>({useToast:()=>({success:jest.fn(),error:jest.fn()})}));
jest.mock('../../components/calendar/CalendarTopbar',()=>()=>null);
const apple={id:1,list_id:10,name:'Äpfel',spec:'1 kg',category:'Obst & Gemüse',checked:false,notes:'Elstar'};
const milk={id:2,list_id:10,name:'Milch',spec:'2 l',category:'Kühlregal',checked:false,priority:'urgent'};
function setup(overrides={},app={}){
 mockApp={members:[],messages:buildMessages('de'),demoMode:true,familyId:1,me:{id:1},isChild:false,...app};
 mockShopping={shoppingLists:[{id:10,name:'Wocheneinkauf'},{id:20,name:'Drogerie'}],activeListId:10,activeList:{id:10,name:'Wocheneinkauf'},items:[apple,milk],uncheckedItems:[apple,milk],checkedItems:[],categories:[],templates:[],storeLinks:[],itemInputRef:{current:null},pendingItemIds:new Set(),newListName:'',...Object.fromEntries(['setActiveListId','setNewListName','createList','updateListDetails','addProduct','toggleItem','editItem','deleteItem','deleteList','completeTrip','undoToggle','createTemplate','updateTemplate','deleteTemplate','applyTemplate','reloadItems'].map(key=>[key,jest.fn().mockResolvedValue(true)])),...overrides};
 return render(<ShoppingView/>);
}
beforeEach(()=>{localStorage.clear();HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};});
const dialog=()=>within(screen.getByRole('dialog'));

test('renders the mockup tiles, department groups and real progress',()=>{
 setup();expect(screen.getByRole('heading',{name:'Für alles, was euch fehlt.'})).toBeVisible();expect(screen.getByRole('region',{name:'Obst & Gemüse'})).toBeVisible();expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow','0');expect(screen.getByRole('checkbox',{name:/^Äpfel,/})).not.toBeChecked();
});
test('tile text checks an item while its three-dot control opens details',()=>{
 setup();fireEvent.click(screen.getByRole('checkbox',{name:/^Äpfel,/}));expect(mockShopping.toggleItem).toHaveBeenCalledWith(1,false);fireEvent.click(screen.getByRole('button',{name:'Details zu Milch'}));expect(dialog().getByLabelText('Details für die Familie')).toBeVisible();expect(mockShopping.toggleItem).toHaveBeenCalledTimes(1);
});
test('search parses quantity and submits the product without losing its category',async()=>{
 setup();const search=screen.getByRole('combobox',{name:'Artikel suchen oder mit Menge hinzufügen'});fireEvent.change(search,{target:{value:'2 kg Äpfel'}});fireEvent.submit(search.closest('form'));await waitFor(()=>expect(mockShopping.addProduct).toHaveBeenCalledWith(expect.objectContaining({name:'Äpfel',spec:'2 kg',category:'Obst & Gemüse'})));
});
test('keyboard suggestions are not active before input and support selection and Escape',async()=>{
 setup();const search=screen.getByRole('combobox',{name:'Artikel suchen oder mit Menge hinzufügen'});expect(screen.queryByRole('listbox')).not.toBeInTheDocument();fireEvent.focus(search);fireEvent.change(search,{target:{value:'Zitr'}});expect(screen.getByRole('option',{name:/Zitronen/})).toBeVisible();fireEvent.keyDown(search,{key:'ArrowDown'});expect(search).toHaveAttribute('aria-activedescendant','shop-suggestion-0');fireEvent.keyDown(search,{key:'Enter'});await waitFor(()=>expect(mockShopping.addProduct).toHaveBeenCalledWith(expect.objectContaining({name:'Zitronen'})));fireEvent.change(search,{target:{value:'Mil'}});fireEvent.keyDown(search,{key:'Escape'});expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});
test('editing saves metadata and selected target list',async()=>{
 setup();fireEvent.click(screen.getByRole('button',{name:'Details zu Äpfel'}));fireEvent.change(dialog().getByLabelText('Menge'),{target:{value:'3'}});fireEvent.change(dialog().getByLabelText('Details für die Familie'),{target:{value:'Bio'}});fireEvent.change(dialog().getByLabelText('Dringlichkeit'),{target:{value:'urgent'}});fireEvent.change(dialog().getByLabelText('Einkaufsliste'),{target:{value:'20'}});fireEvent.click(dialog().getByRole('button',{name:'Speichern',exact:true}));await waitFor(()=>expect(mockShopping.editItem).toHaveBeenCalledWith(1,expect.objectContaining({spec:'3 kg',notes:'Bio',priority:'urgent',list_id:20})));
});
test('failed save keeps the editor and input visible',async()=>{
 setup({editItem:jest.fn().mockResolvedValue(false)});fireEvent.click(screen.getByRole('button',{name:'Details zu Äpfel'}));fireEvent.click(dialog().getByRole('button',{name:'Speichern',exact:true}));expect(await dialog().findByRole('alert')).toBeVisible();expect(dialog().getByLabelText('Artikel')).toHaveValue('Äpfel');
});
test('Cancel closes details without a write',()=>{
 setup();fireEvent.click(screen.getByRole('button',{name:'Details zu Äpfel'}));fireEvent.click(dialog().getByRole('button',{name:'Abbrechen'}));expect(screen.queryByRole('dialog')).toBeNull();expect(mockShopping.editItem).not.toHaveBeenCalled();
});
test('child controls allow checking but hide product/list mutations',()=>{
 setup({}, {isChild:true});expect(screen.queryByRole('button',{name:'Details zu Äpfel'})).toBeNull();expect(screen.queryByRole('button',{name:'Neue Einkaufsliste',exact:true})).toBeNull();expect(screen.queryByRole('combobox',{name:'Artikel suchen oder mit Menge hinzufügen'})).toBeNull();fireEvent.click(screen.getByRole('checkbox',{name:/^Äpfel,/}));expect(mockShopping.toggleItem).toHaveBeenCalled();
});
test('only urgent filters open items without altering basket counts',()=>{
 setup();fireEvent.click(screen.getByRole('button',{name:'Dringend 1'}));expect(screen.queryByRole('checkbox',{name:/^Äpfel,/})).toBeNull();expect(screen.getByRole('checkbox',{name:/^Milch,/})).toBeVisible();expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow','0');
});
test('department order saves against the current list and supports custom categories',async()=>{
 setup({uncheckedItems:[{...apple,category:'Mein Laden'},milk]});fireEvent.click(screen.getByRole('button',{name:'Reihenfolge der Kategorien ändern'}));fireEvent.click(dialog().getByRole('button',{name:'Mein Laden nach unten'}));fireEvent.click(dialog().getByRole('button',{name:'Reihenfolge speichern'}));await waitFor(()=>expect(mockShopping.updateListDetails).toHaveBeenCalledWith(expect.objectContaining({category_order:expect.arrayContaining(['Mein Laden'])})));
});
test('completing uses the archive operation after confirmation and exposes recent products',async()=>{
 const checked={...apple,checked:true};setup({items:[checked,milk],checkedItems:[checked],uncheckedItems:[milk]});const details=document.querySelector('.shop-done');details.open=true;fireEvent(details,new Event("toggle"));fireEvent.click(screen.getByRole('button',{name:'Einkauf abschließen',exact:true}));expect(mockShopping.completeTrip).not.toHaveBeenCalled();fireEvent.click(dialog().getByRole('button',{name:'Einkauf abschließen',exact:true}));await waitFor(()=>expect(mockShopping.completeTrip).toHaveBeenCalled());fireEvent.click(screen.getByRole('button',{name:'Zuletzt',exact:true}));expect(screen.getByRole('button',{name:'Äpfel, hinzufügen',exact:true})).toBeVisible();
});
test('preferences stay scoped to the family and user',()=>{
 setup();fireEvent.click(screen.getByRole('button',{name:'Listenansicht',exact:true}));expect(JSON.parse(localStorage.getItem('tribu_shopping_ui:demo:1')).layout).toBe('list');
});
test('sharing is a text snapshot of open products and includes notes',()=>{
 setup();fireEvent.click(screen.getByRole('button',{name:'Liste weitergeben',exact:true}));expect(dialog().getByRole('textbox',{name:'Einkaufsliste als Text'}).value).toContain('Äpfel · 1 kg · Elstar');
});
test('store search remains reachable from item details without checking',()=>{
 setup({storeLinks:[{id:1,name:'Shop',url_template:'https://example.com/?q={query}'}]});fireEvent.click(screen.getByRole('button',{name:'Details zu Äpfel'}));fireEvent.click(dialog().getByRole('button',{name:'Online suchen'}));expect(screen.getByRole('link',{name:/Shop/})).toHaveAttribute('href','https://example.com/?q=%C3%84pfel');expect(mockShopping.toggleItem).not.toHaveBeenCalled();
});
test('list menu preserves template creation and application',async()=>{
 setup({templates:[{id:1,name:'Frühstück',items:[{name:'Brot'}]}]});fireEvent.click(screen.getAllByRole('button',{name:'Listenoptionen'})[0]);fireEvent.click(dialog().getByRole('button',{name:'Einkaufsvorlagen'}));fireEvent.click(dialog().getByText('Frühstück').closest('article').querySelector('.shopping-template-apply'));await waitFor(()=>expect(mockShopping.applyTemplate).toHaveBeenCalledWith(1));
});
test('English UI uses the translation bundle',()=>{
 setup({}, {messages:buildMessages('en')});expect(screen.getByRole('heading',{name:'For everything you need.'})).toBeVisible();expect(screen.getByRole('button',{name:'New shopping list',exact:true})).toBeVisible();
});
