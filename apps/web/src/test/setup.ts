import '@testing-library/jest-dom';
import { server } from './mocks/server';

// Start MSW server before all tests
beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));

// Reset handlers between tests (removes any runtime overrides)
afterEach(() => server.resetHandlers());

// Clean up after all tests
afterAll(() => server.close());
