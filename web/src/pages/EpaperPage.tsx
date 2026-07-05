import { useAppData } from '../App';
import { EpaperView } from '../components/EpaperView';

export function EpaperPage() {
  const { state, config } = useAppData();
  const online = Boolean(state?.authenticated && state?.snapshot && !state?.lastError);
  return (
    <EpaperView
      layout={config.epaperLayout}
      configRotate={config.epaperRotate}
      online={online}
      version={state?.lastFetchedAt ?? ''}
    />
  );
}
