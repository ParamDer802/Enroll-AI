import { ShieldCheck, ScanFace, HardDrive, FileLock2 } from 'lucide-react';
import { PageHeading } from '../components/ui';
export function PrivacyPage() {
  return (
    <>
      <PageHeading
        eyebrow="LOCAL BY DESIGN"
        title="Your data stays with you."
        description="A clear boundary between student identity and photo quality."
      />
      <div className="privacy-hero">
        <ShieldCheck size={42} />
        <h2>Photo detection. No face recognition.</h2>
        <p>
          ENROLL-AI checks whether a suitable photograph can be captured. It never decides who a
          person is.
        </p>
      </div>
      <div className="privacy-grid">
        {[
          {
            icon: FileLock2,
            title: 'Identity comes from your roster',
            body: 'The current student’s name and enrollment come only from the imported enrollment list. The operator must verify that the correct student is in front of the camera.',
          },
          {
            icon: ScanFace,
            title: 'Quality checks run on your device',
            body: 'MediaPipe detects the presence and location of faces. Image analysis checks framing, basic head roll, brightness, sharpness and stability. No face embeddings, identity predictions or recognition templates are created.',
          },
          {
            icon: HardDrive,
            title: 'Photos remain in this browser',
            body: 'Students, sessions, JPEGs and capture logs are stored locally using IndexedDB. They are not sent to third-party AI APIs. Photos leave the app only when you explicitly export them.',
          },
          {
            icon: ShieldCheck,
            title: 'Keep control of your records',
            body: 'Use an institution-managed device and limit access to its browser profile. This local app does not have user accounts. Export backups before clearing site data or changing browsers. Uninstalling or clearing storage can remove your records.',
          },
        ].map((c) => (
          <section className="panel privacy-card" key={c.title}>
            <c.icon size={25} />
            <h2>{c.title}</h2>
            <p>{c.body}</p>
          </section>
        ))}
      </div>
      <section className="panel privacy-details">
        <h2>Offline readiness</h2>
        <p>
          The app, detection model and WebAssembly runtime are bundled into the offline cache. Wait
          for the “Offline ready” indicator after the first successful load. Camera access requires
          a supported browser and HTTPS (or localhost).
        </p>
        <p>
          Quality checks are capture guidance; they do not prove identity or guarantee compliance
          with any institution’s photograph standards. Review the captured photos before using them.
        </p>
      </section>
    </>
  );
}
