import { ClaudeCharacter } from './ClaudeCharacter';
import { EPAPER, type ClawdAccessory, type ClawdEyes, type ClawdMouth, type ClawdOverhead } from '../lib/usage';

interface Scene {
  title: string;
  desc: string;
  eyes?: ClawdEyes;
  mouth?: ClawdMouth;
  accessory?: ClawdAccessory;
  overhead?: ClawdOverhead;
  auto?: string;
}

const SCENES: Scene[] = [
  { title: 'Tranquille', desc: 'pose par défaut', eyes: 'square', auto: 'rotation' },
  { title: 'Au travail', desc: 'code sur son ordi', eyes: 'square', accessory: 'laptop', auto: 'rotation' },
  { title: 'Pause café', desc: 'le matin', eyes: 'square', accessory: 'coffee', auto: 'matin' },
  { title: 'Content', desc: 'tout roule', eyes: 'happy', auto: 'rotation' },
  { title: 'Magie', desc: 'un peu de magie', eyes: 'square', accessory: 'wand', auto: 'rotation' },
  { title: 'Bisou', desc: 'plein d’amour', eyes: 'wink', mouth: 'kiss', accessory: 'heart', auto: 'rotation' },
  { title: 'Au soleil', desc: 'lunettes + soleil', eyes: 'shades', overhead: 'sun', auto: 'rotation' },
  { title: 'Sous la pluie', desc: 'parapluie', eyes: 'square', overhead: 'umbrella' },
  { title: 'Dodo', desc: 'si inactif ou la nuit', eyes: 'sleep', overhead: 'zzz', auto: 'auto' },
  { title: 'Anniversaire', desc: 'le jour J (config)', eyes: 'happy', overhead: 'sparkle-hat', auto: 'auto' },
  { title: 'Football', desc: 'occasionnel', eyes: 'happy', accessory: 'ball' },
  { title: 'Étourdi', desc: 'occasionnel', eyes: 'spiral' },
];

export function StylesGallery() {
  return (
    <div className="w-full">
      <p className="mb-4 text-center text-sm text-white/50">
        Chaque pose en deux versions : couleur (écran) et noir &amp; blanc (e-paper).
        Certaines s'affichent automatiquement selon l'heure, l'activité ou ton anniversaire.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SCENES.map((s) => (
          <div
            key={s.title}
            className="flex flex-col items-center rounded-2xl border border-white/10 bg-white/[0.03] p-3"
          >
            <div className="flex items-center justify-center gap-2">
              <div className="flex flex-col items-center">
                <ClaudeCharacter
                  size={120}
                  frame="wide"
                  outline
                  eyes={s.eyes}
                  mouth={s.mouth}
                  accessory={s.accessory}
                  overhead={s.overhead}
                />
                <span className="text-[10px] text-white/40">couleur</span>
              </div>
              <div className="flex flex-col items-center">
                <div className="rounded-xl" style={{ background: EPAPER.paper }}>
                  <ClaudeCharacter
                    size={120}
                    frame="wide"
                    mono
                    eyes={s.eyes}
                    mouth={s.mouth}
                    accessory={s.accessory}
                    overhead={s.overhead}
                  />
                </div>
                <span className="text-[10px] text-white/40">noir &amp; blanc</span>
              </div>
            </div>
            <div className="mt-1 text-center">
              <div className="text-sm font-semibold">{s.title}</div>
              <div className="text-xs text-white/45">{s.desc}</div>
              {s.auto && (
                <div className="mt-1 inline-block rounded-full bg-white/10 px-2 text-[10px] text-white/50">
                  {s.auto}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
