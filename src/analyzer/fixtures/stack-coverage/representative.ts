/** Self-authored source fixture. No code in the strings is executed by the Analyzer. */
export const representativeSources:Record<string,string>={
  'package.json':JSON.stringify({name:'expansion-fixture',private:true,packageManager:'pnpm@11.0.0',scripts:{dev:'concurrently "pnpm --filter web dev" "pnpm --filter api test"',test:'vitest run'},devDependencies:{vitest:'3'}},null,2),
  'pnpm-workspace.yaml':'packages:\n  - apps/*\n',
  'apps/web/package.json':JSON.stringify({name:'web',scripts:{dev:'vite',test:'firebase emulators:exec --only auth "vitest run"'},dependencies:{react:'19','react-dom':'19',firebase:'12',vite:'7'}},null,2),
  'apps/web/index.html':'<html><head><link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css"></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
  'apps/web/src/main.tsx':`import {createRoot} from 'react-dom/client';\nimport {App} from './App';\ncreateRoot(document.getElementById('root')!).render(<App/>);`,
  'apps/web/src/App.tsx':`import {useState} from 'react';\nexport interface UserInput {name:string;}\nexport function App(){ const [name,setName]=useState('');async function save(){const payload:UserInput={name};return fetch('/api/users',{method:'POST',body:JSON.stringify(payload)});}return <form onSubmit={save}><input value={name} onChange={event=>setName(event.target.value)}/><button>Save</button></form>;}`,
  'apps/web/src/auth.ts':`import {initializeApp}from'firebase/app';\nimport {getAuth,connectAuthEmulator as connectLocal}from'firebase/auth';\nimport {getFirestore,collection,getDocs}from'firebase/firestore';\nconst app=initializeApp({projectId:'demo-expansion'});\nconst auth=getAuth(app);\nconst db=getFirestore(app);\nconnectLocal(auth,'http://127.0.0.1:9099');\nexport function listUsers(){return getDocs(collection(db,'users'));}`,
  'apps/web/firebase.json':JSON.stringify({emulators:{auth:{host:'127.0.0.1',port:9099}},hosting:{target:'web',public:'dist'}},null,2),
  'apps/web/.firebaserc':'{"projects":{"default":"demo-expansion"}}',
  'services/api/pyproject.toml':'[project]\nname="api"\ndependencies=["fastapi", "pydantic", "sqlalchemy"]\n[project.optional-dependencies]\ntest=["pytest"]\n',
  'services/api/main.py':`from fastapi import FastAPI\nfrom pydantic import BaseModel, Field\nfrom .repository import save_user\nclass UserInput(BaseModel):\n name: str = Field(min_length=1)\napp=FastAPI()\n@app.post('/api/users')\ndef create_user(payload: UserInput):\n validated=UserInput.model_validate(payload)\n return save_user(validated)\n`,
  'services/api/repository.py':`from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column\nclass Base(DeclarativeBase):\n pass\nclass User(Base):\n id: Mapped[int] = mapped_column(primary_key=True)\n name: Mapped[str]\ndef save_user(data):\n return User(name=data.name)\n`,
  'services/api/test_api.py':`import pytest\nfrom .main import UserInput\ndef test_name():\n assert UserInput(name='Alice').name == 'Alice'\n`,
  'compose.yaml':'services:\n  api:\n    build: ./services/api\n    ports: ["8000:8000"]\n    depends_on: [db]\n  db:\n    image: postgres:17\n    ports: ["5432:5432"]\n',
  '.gitlab-ci.yml':'stages: [test, deploy]\ninclude:\n  - local: ci/test.yml\ndeploy:\n  stage: deploy\n  needs: [test]\n  script: firebase deploy --only hosting:web\n',
  'ci/test.yml':'test:\n  stage: test\n  script: pytest\n',
  'infra/cdn.tf':'resource "aws_cloudfront_distribution" "assets" {\n enabled = true\n origin {\n domain_name = "fixture-assets.s3.amazonaws.com"\n origin_id = "assets"\n }\n}\n',
};

export const representativeExpectations={
  stackIds:['react','typescript','tsx','python','fastapi','pydantic','sqlalchemy','pytest','postgresql','firebase','firebase-emulator-suite','firebase-authentication','cloud-firestore','firebase-hosting','jsdelivr','bootstrap','amazon-cloudfront','gitlab-ci','docker-compose'],
  scopes:['apps/web','services/api'],
  environments:{'firebase-authentication':'local','cloud-firestore':'cloud'},
  relations:['/api/users','save_user','name','CloudFront','Origin'],
};
