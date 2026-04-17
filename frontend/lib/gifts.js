export const GIFT_STATUSES = ['idea', 'ordered', 'purchased', 'gifted'];

export const GIFT_OCCASIONS = ['birthday', 'christmas', 'easter', 'other'];

export const GIFT_SORT_OPTIONS = [
  'created_desc',
  'created_asc',
  'occasion_date_asc',
  'price_desc',
  'price_asc',
  'title_asc',
];

export function createEmptyGiftForm() {
  return {
    title: '',
    description: '',
    url: '',
    for_user_id: '',
    for_person_name: '',
    occasion: '',
    occasion_date: '',
    status: 'idea',
    notes: '',
    price_eur: '',
  };
}
