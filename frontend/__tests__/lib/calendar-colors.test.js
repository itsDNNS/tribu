import { calendarEventColors, calendarEventStyle, DEFAULT_CALENDAR_COLOR } from '../../lib/calendar-colors';
const members = [{user_id:1,color:'#06b6d4'},{user_id:2,color:'#f43f5e'}];
describe('calendar member colors', () => {
  it('uses the assigned member color for numeric and string IDs', () => {
    expect(calendarEventColors({assigned_to:['2']},members)).toEqual(['#f43f5e']);
    expect(calendarEventColors({assigned_to:[1]},members)).toEqual(['#06b6d4']);
  });
  it('keeps explicit event colors including birthday colors', () => {
    expect(calendarEventColors({assigned_to:[1],color:'#abcdef'},members)).toEqual(['#abcdef']);
  });
  it('includes every participant color for shared and whole-family events', () => {
    expect(calendarEventColors({assigned_to:[2,1]},members)).toEqual(['#06b6d4','#f43f5e']);
    expect(calendarEventColors({assigned_to:'all'},members)).toEqual(['#06b6d4','#f43f5e']);
    expect(calendarEventStyle({assigned_to:'all'},members)['--event-stripe']).toBe('linear-gradient(to bottom, #06b6d4 0% 50%, #f43f5e 50% 100%)');
  });
  it('handles missing assignments and deleted members with a neutral fallback', () => {
    expect(calendarEventColors({},members)).toEqual([DEFAULT_CALENDAR_COLOR]);
    expect(calendarEventColors({assigned_to:[99]},members)).toEqual([DEFAULT_CALENDAR_COLOR]);
  });
  it('uses the same roster-index fallback as the family legend', () => {
    expect(calendarEventColors({assigned_to:[2]},[{user_id:1},{user_id:2}])).toEqual(['var(--member-2)']);
  });
  it('reflects member color changes without rewriting events', () => {
    const event={assigned_to:[1],color:null};
    expect(calendarEventColors(event,[{user_id:1,color:'#123456'}])).toEqual(['#123456']);
    expect(calendarEventColors(event,[{user_id:1,color:'#654321'}])).toEqual(['#654321']);
  });
});
