import { AnalyzerEmptyOrbit } from './AnalyzerEmptyOrbit';

export function AnalyzerEmptyState() {
  return <section className="analyzer-empty-state" aria-labelledby="analyzer-empty-title">
    <AnalyzerEmptyOrbit />
    <div>
      <p className="analyzer-panel-kicker">Private by default</p>
      <h2 id="analyzer-empty-title">解析するProject Folderを選択してください</h2>
      <p>選択したsourceはこのBrowser内だけで読み取ります。Cloudflareや外部APIへアップロードせず、Reloadすると再選択が必要です。</p>
      <ul>
        <li>JavaScript、Python、JVM、.NET、Rustなどのmanifestとsource</li>
        <li>workspace、直接依存、コマンドと配置・サービス設定</li>
        <li>直接のsource rangeを持つEvidence</li>
      </ul>
    </div>
  </section>;
}
