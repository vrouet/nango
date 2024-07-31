import { useMeta } from '../hooks/useMeta';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { useEffect } from 'react';

export const Root: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();

    const showInteractiveDemo = useStore((state) => state.showInteractiveDemo);
    const env = useStore((state) => state.env);
    const { meta } = useMeta();

    useEffect(() => {
        if (!meta) {
            return;
        }

        if (env === 'dev' && showInteractiveDemo && !meta.onboardingComplete) {
            navigate('/dev/interactive-demo');
            return;
        }

        navigate(`/${env}/`);
    }, [meta, location, env, navigate, showInteractiveDemo]);

    return null;
};
