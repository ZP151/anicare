import {act,renderHook,waitFor} from '@testing-library/react-native';
const mockRead=jest.fn();let mockListener:(subject:string|null)=>void=()=>{};
jest.mock('./session-subject',()=>({readSessionSubjectStrict:()=>mockRead(),subscribeSessionSubject:(listener:typeof mockListener)=>{mockListener=listener;return()=>{};}}));
const path=require('node:path'),fs=require('node:fs');
const app=path.resolve(__dirname,'../..');
const preset=require.resolve('babel-preset-expo',{paths:[require.resolve('jest-expo')]});
const babel=require(require.resolve('@babel/core',{paths:[preset]}));
const code=babel.transformSync(fs.readFileSync(path.join(__dirname,'use-account-session.ts'),'utf8'),{filename:'src/auth/use-account-session.ts',cwd:app,configFile:false,babelrc:false,presets:[[preset,{}]],caller:{name:'metro',platform:'ios',bundler:'metro',engine:'hermes',isDev:false,isNodeModule:false,isServer:false,isReactServer:false,isFastRefreshEnabled:false,supportsReactCompiler:true,supportsStaticESM:false,possibleProjectRoot:app}}).code;
const compiledModule={exports:{} as typeof import('./use-account-session')};
new Function('require','module','exports',code)(require,compiledModule,compiledModule.exports);
const {useAccountSession}=compiledModule.exports;
beforeEach(()=>mockRead.mockReset().mockResolvedValue(null));
it('keeps a pending page valid when INITIAL_SESSION repeats the settled identity',async()=>{
 const view=await renderHook(()=>useAccountSession());await waitFor(()=>expect(view.result.current.owner).toBeNull());
 const pinned=view.result.current.pin();
 let resolve!:(subject:null)=>void;mockRead.mockImplementationOnce(()=>new Promise(r=>resolve=r));
 const validation=pinned();
 await act(async()=>mockListener(null));
 await act(async()=>resolve(null));
 expect(await validation).toBe(true);
 await view.unmount();
});
it('invalidates a pending page immediately when the identity actually changes',async()=>{
 const view=await renderHook(()=>useAccountSession());await waitFor(()=>expect(view.result.current.owner).toBeNull());
 const pinned=view.result.current.pin();let finish!:(subject:null)=>void;
 mockRead.mockImplementationOnce(()=>new Promise(r=>finish=r));const validation=pinned();
 mockRead.mockResolvedValue('new-user');await act(async()=>mockListener('new-user'));await waitFor(()=>expect(view.result.current.owner).toBe('new-user'));
 await act(async()=>finish(null));expect(await validation).toBe(false);await view.unmount();
});
