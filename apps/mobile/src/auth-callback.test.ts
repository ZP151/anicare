import { AUTH_CALLBACK_MESSAGE } from '../app/auth/callback';

it('uses the WhiskerCommons display name in auth callback copy', () => {
  expect(AUTH_CALLBACK_MESSAGE).toContain('WhiskerCommons');
  expect(AUTH_CALLBACK_MESSAGE).not.toContain('AnimalHelper');
});
