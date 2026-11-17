import { ApiKeySection } from './config/ApiKeySection';
import { ClaudeSection } from './config/ClaudeSection';
import { LimitsSection } from './config/LimitsSection';
import { SecuritySection, SystemSection } from './config/SystemSection';

/**
 * Réglages du compte et du système. Chaque section s'enregistre seule ; les
 * réglages de la dalle sont sur la page e-paper, ceux de Clawd sur Humeurs.
 */
export function ConfigPage() {
  return (
    <div className="w-full max-w-md self-center">
      <h2 className="mb-1 text-lg font-semibold">Configuration</h2>
      <p className="mb-4 text-xs text-white/55">
        Affichage de la dalle : page <strong>e-paper</strong> · comportement de Clawd : page <strong>Humeurs</strong>.
      </p>
      <div className="space-y-4">
        <ClaudeSection />
        <LimitsSection />
        <ApiKeySection />
        <SecuritySection />
        <SystemSection />
      </div>
    </div>
  );
}
