const RULES = [
  { icon: '⚡', label: 'Énergie', desc: "100 − utilisation de la fenêtre 5 h. Se vide quand tu consommes ton quota court terme, se recharge à chaque reset." },
  { icon: '💪', label: 'Forme', desc: '100 − utilisation de la fenêtre 7 j. Reflète ta marge sur la semaine.' },
  { icon: '🍔', label: 'Repu', desc: "Se vide avec l'inactivité : 100 quand tu viens de coder, ~0 après ~6 h sans activité détectée." },
  { icon: '😊', label: 'Bonheur', desc: 'Moyenne des trois autres (énergie, forme, repu).' },
];

export function StatsModal({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1a1613] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Les stats de Clawd</h2>
          <button onClick={onClose} className="text-white/50 hover:text-white">
            ✕
          </button>
        </div>

        <div className="space-y-3">
          {RULES.map((r) => (
            <div key={r.label} className="flex gap-3">
              <span className="w-5 text-center">{r.icon}</span>
              <div>
                <div className="text-sm font-medium">{r.label}</div>
                <div className="text-xs text-white/55">{r.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 border-t border-white/10 pt-4">
          <h3 className="mb-1 text-sm font-semibold">Niveau &amp; âge</h3>
          <p className="text-xs text-white/55">
            Clawd naît au 1<sup>er</sup> lancement. Son <strong>âge</strong> est le temps écoulé
            depuis. Son <strong>niveau</strong> démarre à 1 et monte de deux façons :
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-white/55">
            <li>
              <strong>+1 par semaine</strong> d'existence (le temps qui passe) ;
            </li>
            <li>
              <strong>+1 par tranche de 100 points d'usage cumulés</strong> — chaque hausse des
              jauges 5 h / 7 j ajoute de l'XP.
            </li>
          </ul>
          <p className="mt-2 text-xs text-white/40">
            Formule : niveau = 1 + ⌊jours/7⌋ + ⌊XP/100⌋.
          </p>
        </div>
      </div>
    </div>
  );
}
