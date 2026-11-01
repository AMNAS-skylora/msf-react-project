import './styles.css';
export default function App() {
  return <main className="background-stage" aria-label="MSF poster background">
    <img className="background-art" src={`${import.meta.env.BASE_URL}assets/msf-stage-background.svg`} alt="Soft mint-green poster background with blurred leaves and an MSF flag at the bottom left" />
  </main>;
}
