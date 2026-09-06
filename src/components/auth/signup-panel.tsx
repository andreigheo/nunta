import { SarbatoMark } from "@/components/brand/sarbato-mark";
import { SignupArtwork } from "./signup-artwork";
import styles from "./signup-concept.module.css";

export function SignupPanel() {
  return (
    <aside className={styles.panel}>
      <SarbatoMark inverse className={styles.mark} />
      <div className={styles.intro}>
        <p className={styles.headline}>Un singur fir.<br />Un eveniment<br />întreg.</p>
        <p className={styles.lead}>De la prima idee,<br />până la ultimul invitat.</p>
      </div>
      <div className={styles.artwork}><SignupArtwork /></div>
      <p className={styles.caption}>Oamenii se întâlnesc. Detaliile se leagă.</p>
    </aside>
  );
}
