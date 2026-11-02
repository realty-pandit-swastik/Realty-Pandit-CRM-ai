import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import Login from './Login';
import { useSession } from './SessionProvider';
import { SessionController } from '../../storage/session';
import { ApiClient } from '../../api/client';
jest.mock('./SessionProvider', () => ({ useSession: jest.fn() }));

it('retains user input after a failed sign-in and prevents empty submission', async () => {
  const controller = new SessionController(new ApiClient('https://example.invalid'), { get: async () => null, set: async () => {}, clear: async () => {} }, () => {});
  const login = jest.spyOn(controller, 'login').mockRejectedValue(new Error('Invalid credentials'));
  jest.mocked(useSession).mockReturnValue({ controller, session: null, configurationError: null, offline: false, scope: 'anonymous' });
  await render(<Login />);
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Phone number'), '9000000001');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'synthetic-password');
  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  await waitFor(() => expect(screen.getByText('Invalid credentials')).toBeTruthy());
  expect(screen.getByLabelText('Phone number').props.value).toBe('9000000001');
  expect(screen.getByLabelText('Password').props.value).toBe('synthetic-password');
  expect(login).toHaveBeenCalledTimes(1);
});
