import {useApp} from '../../contexts/AppContext';
import {t} from '../../lib/i18n';
export function useShoppingText() {
 const {messages}=useApp();
 return (key,values=[])=>t(messages,key).replace(/\{(\d+)\}/g,(match,index)=>String(values[index] ?? match));
}
