import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import CalendarView from '../../components/calendar';
import en from '../../i18n/en.json';
import { useApp } from '../../contexts/AppContext';
import * as api from '../../lib/api';

jest.mock('../../contexts/AppContext', () => ({ useApp: jest.fn() }));
jest.mock('../../contexts/ToastContext', () => ({ useToast: () => ({ success: jest.fn(), error: jest.fn() }) }));
jest.mock('../../lib/api', () => ({ apiCreateEvent: jest.fn(), apiUpdateEvent: jest.fn(), apiDeleteEvent: jest.fn(), apiGetEvents: jest.fn() }));

const member = { user_id: 1, display_name: 'Alex' };
const event = { id: 1, title: 'Piano lesson', starts_at: '2026-05-04T14:00:00', ends_at: '2026-05-04T15:00:00', assigned_to: [1], description: 'Bring music', color: '#8052a3' };
function Harness({ initialEvents = [event], ...overrides }) {
  const [events, setEvents] = useState(initialEvents);
  const [summary, setSummary] = useState({ next_events: [] });
  useApp.mockReturnValue({ familyId: 1, me: member, members: [member, { user_id: 2, display_name: 'Sam' }], messages: en, lang: 'en', weekStart: 'monday', timeFormat: '24h', isChild: false, demoMode: true, birthdays: [], loadDashboard: jest.fn(), events, setEvents, summary, setSummary, ...overrides });
  return <CalendarView />;
}
const openEvent = () => fireEvent.click(screen.getByRole('button', { name: /Piano lesson/ }));
const openEditor = () => { openEvent(); fireEvent.click(screen.getByRole('button', { name: 'Edit', exact: true })); };
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.setItem('tribu_calendar_focus', '2026-05-04T12:00:00');
  api.apiGetEvents.mockResolvedValue({ ok: true, data: [event] });
  api.apiCreateEvent.mockResolvedValue({ ok: true, data: {} });
  api.apiUpdateEvent.mockResolvedValue({ ok: true, data: {} });
});

describe('Mockup calendar and event overlays', () => {
  it.each([['monday','Monday'],['sunday','Sunday']])('uses complete week rows with the %s preference and clickable adjacent days', (weekStart, firstDay) => {
    const { container } = render(<Harness weekStart={weekStart} />);
    expect(container.querySelectorAll('.tc-calendar-day')).toHaveLength(weekStart==='monday'?35:42);
    expect(container.querySelector('.tc-weekday')).toHaveTextContent(firstDay);
    fireEvent.click(container.querySelector('.tc-calendar-day.outside .tc-day-number'));
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Create event' })).toBeVisible();
  });
  it('shows separately named birthdays and event icons in the same day', () => {
    const birthdays = [{id:11, contact_id:21, person_name:'Twin',month:5,day:4},{id:12,contact_id:22,person_name:'Twin',month:5,day:4}];
    const { container } = render(<Harness birthdays={birthdays} initialEvents={[{...event, icon:'soccer'}]} />);
    expect(container.querySelectorAll('.tc-calendar-event')).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: /Twin/ })).toHaveLength(2);
    expect(container.querySelector('.tc-calendar-event svg')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Piano lesson/ })).toHaveTextContent('⚽');
  });
  it('filters the calendar by member and restores all events when toggled off', () => {
    render(<Harness initialEvents={[event,{...event,id:2,title:'Sam appointment',assigned_to:[2]}]} />);
    fireEvent.click(screen.getByRole('button',{name:'Sam',exact:true}));
    expect(screen.queryByRole('button',{name:/Piano lesson/})).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:/Sam appointment/})).toBeVisible();
    fireEvent.click(screen.getByRole('button',{name:'Sam',exact:true}));
    expect(screen.getByRole('button',{name:/Piano lesson/})).toBeVisible();
  });
  it('creates a dated event through a modal and displays it in the calendar', async () => {
    render(<Harness initialEvents={[]} />);
    fireEvent.click(screen.getByRole('button',{name:'Create event'}));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('What is happening?')).toHaveFocus();
    expect(within(dialog).getByLabelText('Date')).toHaveValue('2026-05-04');
    fireEvent.change(within(dialog).getByLabelText('What is happening?'),{target:{value:'New plan'}});
    fireEvent.change(within(dialog).getByLabelText('Notes'),{target:{value:'Remember this'}});
    fireEvent.click(within(dialog).getByRole('button',{name:'Save',exact:true}));
    await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button',{name:/New plan/}));
    expect(screen.getByRole('dialog')).toHaveTextContent('Remember this');
  });
  it('edits from the week view and retains notes and multi-day dates', async () => {
    render(<Harness initialEvents={[{...event, ends_at:'2026-05-06T15:00:00'}]} />);
    fireEvent.click(screen.getByRole('button',{name:'Week',exact:true}));
    expect(screen.getAllByRole('button',{name:/Piano lesson/})).toHaveLength(3);
    fireEvent.click(screen.getAllByRole('button',{name:/Piano lesson/})[0]);
    fireEvent.click(screen.getByRole('button',{name:'Edit',exact:true}));
    expect(screen.getByLabelText('Notes')).toHaveValue('Bring music');
    expect(screen.getByLabelText('End date')).toHaveValue('2026-05-06');
    fireEvent.change(screen.getByLabelText('Date'),{target:{value:'2026-05-05'}});
    expect(screen.getByLabelText('End date')).toHaveValue('2026-05-07');
    fireEvent.change(screen.getByLabelText('What is happening?'),{target:{value:'Updated lesson'}});
    fireEvent.click(screen.getByRole('button',{name:'Save',exact:true}));
    await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getAllByRole('button',{name:/Updated lesson/})).toHaveLength(3);
  });
  it('keeps a failed save open with the draft and permits a retry', async () => {
    api.apiUpdateEvent.mockResolvedValueOnce({ok:false,data:{detail:'failed'}}).mockResolvedValueOnce({ok:true,data:{}});
    render(<Harness demoMode={false} />);
    openEditor();
    fireEvent.change(screen.getByLabelText('What is happening?'),{target:{value:'Keep my draft'}});
    fireEvent.click(screen.getByRole('button',{name:'Save',exact:true}));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('What is happening?')).toHaveValue('Keep my draft');
    fireEvent.click(screen.getByRole('button',{name:'Save',exact:true}));
    await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.apiUpdateEvent).toHaveBeenCalledTimes(2);
  });
  it('validates end time before submitting and keeps the editor open', async () => {
    render(<Harness demoMode={false} />);openEditor();
    fireEvent.change(screen.getByLabelText('Until'),{target:{value:'13:00'}});
    fireEvent.click(screen.getByRole('button',{name:'Save',exact:true}));
    expect(screen.getByRole('alert')).toHaveTextContent('The end must be after the start.');
    expect(api.apiUpdateEvent).not.toHaveBeenCalled();
  });
  it('requires confirmation before deleting an event', async () => {
    render(<Harness />);openEditor();
    fireEvent.click(screen.getByRole('button',{name:'Delete',exact:true}));
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Delete this event?');
    fireEvent.click(screen.getByRole('button',{name:'Delete',exact:true}));
    await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('button',{name:/Piano lesson/})).not.toBeInTheDocument();
  });
  it('keeps imported events read-only but allows independent duplication', () => {
    render(<Harness initialEvents={[{...event,source_type:'subscription'}]} />);openEvent();
    expect(screen.queryByRole('button',{name:'Edit',exact:true})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Duplicate event',exact:true}));
    expect(screen.getByLabelText('What is happening?')).toHaveValue('Piano lesson');
    expect(screen.getByLabelText('Notes')).toHaveValue('Bring music');
    expect(screen.getByRole('button',{name:'Save',exact:true})).toBeVisible();
  });
  it('does not expose mutations to children', () => {
    render(<Harness isChild />);openEvent();
    expect(screen.queryByRole('button',{name:'Create event'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Edit',exact:true})).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Duplicate event',exact:true})).not.toBeInTheDocument();
  });
  it('does not submit twice while a save is pending', async () => {
    let resolve;
    api.apiUpdateEvent.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    render(<Harness demoMode={false} />);openEditor();
    const form = screen.getByLabelText('What is happening?').closest('form');
    fireEvent.submit(form);fireEvent.submit(form);
    expect(api.apiUpdateEvent).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button',{name:'Save',exact:true})).toBeDisabled();
    resolve({ok:true,data:{}});
    await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
  it('offers separate occurrence and series deletion for recurring events', async () => {
    const recurring = {...event, is_recurring:true, recurrence:'weekly', occurrence_date:'2026-05-04'};
    api.apiDeleteEvent.mockResolvedValue({ok:true});
    api.apiGetEvents.mockResolvedValue({ok:true,data:[recurring]});
    render(<Harness demoMode={false} initialEvents={[recurring]} />);openEditor();
    fireEvent.click(screen.getByRole('button',{name:'Delete',exact:true}));
    fireEvent.click(screen.getByRole('button',{name:en['module.calendar.delete_this_only'],exact:true}));
    await waitFor(()=>expect(api.apiDeleteEvent).toHaveBeenCalledWith(1,'2026-05-04'));
    await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('uses the same member color in month, week and day details and respects overrides', () => {
    const coloredMembers = [{...member, color:'#06b6d4'}, {user_id:2,display_name:'Sam',color:'#f43f5e'}];
    const { container } = render(<Harness members={coloredMembers} initialEvents={[{...event,color:null}]} />);
    expect(screen.getByRole('button',{name:/Piano lesson/}).style.getPropertyValue('--event-color')).toBe('#06b6d4');
    fireEvent.click(screen.getByRole('button',{name:'Week',exact:true}));
    expect(screen.getByRole('button',{name:/Piano lesson/}).style.getPropertyValue('--event-color')).toBe('#06b6d4');
    fireEvent.click(screen.getByRole('button',{name:'Month',exact:true}));
    fireEvent.click(screen.getByRole('button',{name:'Monday, May 4, 2026',exact:true}));
    expect(container.querySelector('.tc-event-dot').style.getPropertyValue('--event-color')).toBe('#06b6d4');
  });
  it('creates automatic member colors by default and allows a manual override', async () => {
    render(<Harness demoMode={false} />);
    fireEvent.click(screen.getByRole('button',{name:'Create event',exact:true}));
    expect(screen.getByRole('button',{name:'Family colors',exact:true})).toHaveAttribute('aria-pressed','true');
    fireEvent.change(screen.getByLabelText('What is happening?'),{target:{value:'Automatic plan'}});
    fireEvent.click(screen.getByRole('checkbox',{name:'Sam',exact:true}));
    fireEvent.click(screen.getByRole('button',{name:'Save',exact:true}));
    await waitFor(()=>expect(api.apiCreateEvent).toHaveBeenCalledWith(expect.objectContaining({color:null,assigned_to:[1,2]})));
    await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    openEditor();
    expect(screen.getByRole('button',{name:'Family colors',exact:true})).toHaveAttribute('aria-pressed','false');
    fireEvent.click(screen.getByRole('button',{name:'#759c5d',exact:true}));
    fireEvent.click(screen.getByRole('button',{name:'Save',exact:true}));
    await waitFor(()=>expect(api.apiUpdateEvent).toHaveBeenCalledWith(1,expect.objectContaining({color:'#759c5d'})));
  });

});

it('shows a multi-day event on each intersecting day, excluding its midnight end', () => {
  const { container } = render(<Harness initialEvents={[{...event, ends_at:'2026-05-07T00:00:00'}]} />);
  expect(container.querySelectorAll('.tc-calendar-event')).toHaveLength(3);
  fireEvent.click(screen.getByRole('button',{name:'Week',exact:true}));
  expect(container.querySelectorAll('.tc-week-item')).toHaveLength(3);
});
