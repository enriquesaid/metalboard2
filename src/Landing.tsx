import { useEffect, useState } from 'react';
import './landing.css';

const examples = [
  {id:'checkout', label:'Diagnóstico de checkout', detail:'Do evento à hipótese. Do dado à interface.', image:'/marketing/checkout.jpg', alt:'Eventos de checkout conectados ao funil por dispositivo, à hipótese sobre o formulário de endereço e ao próximo teste.'},
  {id:'suporte', label:'Triagem de suporte', detail:'Da fila ao responsável. Com contexto para agir.', image:'/marketing/suporte.jpg', alt:'Dados dos chamados conectados à fila com filtro de prioridade, à escolha do primeiro atendimento e à passagem de turno.'},
];
export default function Landing() {
  const [selected, setSelected] = useState(0);
  const example = examples[selected];
  useEffect(() => {
    document.title = 'Metalboard — Pense em fluxo. Construa no mesmo lugar.';
    const description = document.createElement('meta');
    description.name = 'description';
    description.content = 'Ideias, dados, código e resultados em um canvas conectado. Explore casos práticos no Metalboard.';
    document.head.append(description);
    return () => description.remove();
  }, []);
  return <div className="promo-page">
    <header className="promo-nav">
      <a href="/apresentacao" className="promo-brand" aria-label="Metalboard — apresentação"><img src="/brand/logo.svg" width="154" height="19" alt="Metalboard" /></a>
      <span className="promo-edition"><i aria-hidden="true" /> UM ESPAÇO PARA CONSTRUIR</span>
      <a className="promo-open" href="/?board">Abrir meu board <span aria-hidden="true">↗</span></a>
    </header>
    <main className="promo-hero">
      <div className="promo-intro">
        <h1>Pense em fluxo.<br /><span>Construa no mesmo lugar.</span></h1>
        <div className="promo-pitch">
          <p>Conecte ideias, dados e código em um canvas infinito. Teste uma hipótese, veja o resultado e continue de onde o raciocínio parou.</p>
          <a className="promo-cta" href={`/?demo=${example.id}`}>Explorar este exemplo <span aria-hidden="true">↗</span></a>
          <small>Demo no navegador. Terminal e APIs no desktop.</small>
          <a className="promo-download" href="/downloads/Metalboard-0.1.0-mac-arm64.zip" download>Baixar para Mac <span aria-hidden="true">↓</span></a>
          <small>macOS · Apple Silicon · .zip</small>
        </div>
      </div>
      <div className="promo-casebar">
        <div className="promo-cases" role="group" aria-label="Casos de uso">
          {examples.map((item, index) => <button key={item.id} type="button" aria-pressed={index===selected} aria-controls="case-preview" onClick={()=>setSelected(index)}><span className="promo-case-number" aria-hidden="true">0{index+1}</span>{item.label}</button>)}
        </div>
        <span className="promo-case-detail" aria-live="polite">{example.detail}</span>
      </div>
      <figure id="case-preview" className="promo-preview">
        <a href={`/?demo=${example.id}`} aria-label={`Explorar o board: ${example.label}`}><img key={example.id} src={example.image} alt={example.alt} width="1600" height="1000" fetchPriority="high" /></a>
        <figcaption><span>Captura real do Metalboard <span aria-hidden="true">/</span> dados demonstrativos</span><a href={example.image} target="_blank" rel="noreferrer">Ampliar captura <span aria-hidden="true">↗</span></a></figcaption>
      </figure>
    </main>
  </div>;
}
