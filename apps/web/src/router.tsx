import { createRootRoute, createRoute, createRouter, Outlet } from '@tanstack/react-router';
import { App } from './App.js';

// Root layout route
const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

// Home route (the core video chat application)
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: App,
});

// Verify email route (direct link from registration verification emails)
const verifyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/verify-email',
  component: App,
});

const routeTree = rootRoute.addChildren([indexRoute, verifyRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
