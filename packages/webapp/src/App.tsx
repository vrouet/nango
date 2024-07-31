import { useEffect } from 'react';
import { SWRConfig } from 'swr';
import { Route, Navigate } from 'react-router-dom';
import { MantineProvider, createTheme } from '@mantine/core';
import { useSignout } from './utils/user';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { fetcher } from './utils/api';
import { useStore } from './store';
import { Toaster } from './components/ui/toast/Toaster';

import { Signup } from './pages/Account/Signup';
import { InviteSignup } from './pages/Account/InviteSignup';
import Signin from './pages/Account/Signin';
import { InteractiveDemo } from './pages/InteractiveDemo';
import IntegrationList from './pages/Integration/List';
import CreateIntegration from './pages/Integration/Create';
import ShowIntegration from './pages/Integration/Show';
import ConnectionList from './pages/Connection/List';
import Connection from './pages/Connection/Show';
import ConnectionCreate from './pages/Connection/Create';
import { EnvironmentSettings } from './pages/Environment/Settings';
import { PrivateRoute } from './components/PrivateRoute';
import ForgotPassword from './pages/Account/ForgotPassword';
import ResetPassword from './pages/Account/ResetPassword';
import { VerifyEmail } from './pages/Account/VerifyEmail';
import { VerifyEmailByExpiredToken } from './pages/Account/VerifyEmailByExpiredToken';
import { EmailVerified } from './pages/Account/EmailVerified';
import AuthLink from './pages/AuthLink';
import { Homepage } from './pages/Homepage/Show';
import { NotFound } from './pages/NotFound';
import { LogsSearch } from './pages/Logs/Search';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { SentryRoutes } from './utils/sentry';
import { TeamSettings } from './pages/Team/Settings';
import { UserSettings } from './pages/User/Settings';
import { Root } from './pages/Root';
import { globalEnv } from './utils/env';

const theme = createTheme({
    fontFamily: 'Inter'
});

const App = () => {
    const env = useStore((state) => state.env);
    const signout = useSignout();
    const setShowInteractiveDemo = useStore((state) => state.setShowInteractiveDemo);
    const showInteractiveDemo = useStore((state) => state.showInteractiveDemo);

    useEffect(() => {
        setShowInteractiveDemo(env === 'dev' && globalEnv.features.interactiveDemo);
    }, [env, setShowInteractiveDemo]);

    return (
        <MantineProvider theme={theme}>
            <TooltipProvider>
                <SWRConfig
                    value={{
                        refreshInterval: 15 * 60000,
                        // Our server is not well configured if we enable that it will just fetch all the time
                        revalidateIfStale: false,
                        revalidateOnFocus: false,
                        revalidateOnReconnect: true,
                        fetcher,
                        onError: (error) => {
                            if (error.status === 401) {
                                return signout();
                            }
                        }
                    }}
                >
                    <SentryRoutes>
                        <Route path="/" element={<Root />} />
                        <Route element={<PrivateRoute />} key={env}>
                            <Route path="/:env" element={<Homepage />} />
                            {showInteractiveDemo && (
                                <Route path="/dev/interactive-demo" element={<PrivateRoute />}>
                                    <Route path="/dev/interactive-demo" element={<InteractiveDemo />} />
                                </Route>
                            )}
                            <Route path="/:env/integrations" element={<IntegrationList />} />
                            <Route path="/:env/integration/create" element={<CreateIntegration />} />
                            <Route path="/:env/integration/:providerConfigKey" element={<ShowIntegration />} />
                            <Route path="/:env/connections" element={<ConnectionList />} />
                            <Route path="/:env/connections/create" element={<ConnectionCreate />} />
                            <Route path="/:env/connections/create/:providerConfigKey" element={<ConnectionCreate />} />
                            <Route path="/:env/connections/:providerConfigKey/:connectionId" element={<Connection />} />
                            <Route path="/:env/activity" element={<Navigate to={`/${env}/logs`} replace={true} />} />
                            <Route path="/:env/logs" element={<LogsSearch />} />
                            <Route path="/:env/environment-settings" element={<EnvironmentSettings />} />
                            <Route path="/:env/project-settings" element={<Navigate to="/environment-settings" />} />
                            <Route path="/:env/account-settings" element={<Navigate to="/team-settings" />} />
                            <Route path="/:env/team-settings" element={<TeamSettings />} />
                            <Route path="/:env/user-settings" element={<UserSettings />} />
                        </Route>
                        <Route path="/auth-link" element={<AuthLink />} />
                        {true && <Route path="/hn-demo" element={<Navigate to={'/signup'} />} />}
                        {globalEnv.features.auth && (
                            <>
                                <Route path="/signin" element={<Signin />} />
                                <Route path="/signup/:token" element={<InviteSignup />} />
                                <Route path="/forgot-password" element={<ForgotPassword />} />
                                <Route path="/reset-password/:token" element={<ResetPassword />} />
                                <Route path="/verify-email/:uuid" element={<VerifyEmail />} />
                                <Route path="/verify-email/expired/:token" element={<VerifyEmailByExpiredToken />} />
                                <Route path="/signup/verification/:token" element={<EmailVerified />} />
                            </>
                        )}
                        {globalEnv.features.auth && <Route path="/signup" element={<Signup />} />}
                        <Route path="*" element={<NotFound />} />
                    </SentryRoutes>
                </SWRConfig>
                <ToastContainer />
            </TooltipProvider>
            <Toaster />
        </MantineProvider>
    );
};

export default App;
