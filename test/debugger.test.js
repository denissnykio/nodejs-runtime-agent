const test = require('tap').test;
const sinon = require('sinon');
const inspector = require('inspector');
const EventEmitter = require('events');

const dbg = require('../lib/debugger-wrapper');
const transmitter = require('../lib/transmitter');
const moduleUtils = require('../lib/module-utils');
const snapshotReader = require('../lib/snapshot/reader');

class MockSession extends EventEmitter {
  constructor() {
    super();
  };

  connect() {};

  post(method, params, cb) {
    if ((method === 'Debugger.setBreakpointByUrl') && (params.lineNumber === 157)) {
      cb(undefined, {breakpointId: 'getPath_BP_ID'});
    } else if ((method === 'Debugger.setBreakpointByUrl') && (params.lineNumber == 186)) {
      cb(undefined, {breakpointId: 'serve_BP_ID'});
    } else if ((method === 'Debugger.setBreakpointByUrl') && (params.lineNumber == 178)) {
      cb(undefined, {breakpointId: 'getUrl_BP_ID'});
    } else if ((method === 'Debugger.setBreakpointByUrl') && (params.lineNumber !== 157)) {
      cb({error: 'MY_ERROR_MESSAGE'}, undefined);
    }
  }
}

test('test setting a breakpoint', function (t) {
  const mock = new MockSession();
  sinon.stub(inspector, 'Session').returns(mock);
  sinon.stub(moduleUtils, 'getModuleInfo').returns({
    'version': '0.2.1',
    'name': 'st',
    'scriptRelativePath': 'st.js',
    'scriptPath': `${__dirname}/fixtures/st/node_modules/st.js`
  });
  dbg.init();
  snapshotReader.setVulnerabiltiesMetadata(require('./fixtures/st/vulnerable_methods.json'));
  const stScriptInfo = require('./fixtures/st/script.json');
  const transmitterSpy = sinon.spy(transmitter, 'addEvent');
  stScriptInfo.params.url = __dirname + '/' + stScriptInfo.params.url;
  mock.emit('Debugger.scriptParsed', stScriptInfo);

  t.assert(stScriptInfo.params.url in dbg.scriptUrlToInstrumentedFunctions);
  const monitoredFunctionsBefore = dbg.scriptUrlToInstrumentedFunctions[stScriptInfo.params.url];
  t.equal(Object.keys(monitoredFunctionsBefore).length, 2, 'two monitored functions');
  t.assert('Mount.prototype.getPath' in monitoredFunctionsBefore, 'getPath newly monitored');
  t.equal(monitoredFunctionsBefore['Mount.prototype.getPath'], 'getPath_BP_ID');
  t.assert('Mount.prototype.getUrl' in monitoredFunctionsBefore, 'getUrl newly monitored');
  t.equal(monitoredFunctionsBefore['Mount.prototype.getUrl'], 'getUrl_BP_ID');
  t.assert('error' in transmitterSpy.args[0][0], 'Error event was added to transmitter');
  t.equal(1, transmitterSpy.callCount, 'Add event was call once because of set bp error');

  snapshotReader.setVulnerabiltiesMetadata(require('./fixtures/st/vulnerable_methods_new.json'));
  dbg.refreshInstrumentation();

  t.assert(stScriptInfo.params.url in dbg.scriptUrlToInstrumentedFunctions);
  const monitoredFunctionsAfter = dbg.scriptUrlToInstrumentedFunctions[stScriptInfo.params.url];
  t.equal(Object.keys(monitoredFunctionsAfter).length, 2, 'two monitored functions');
  t.assert('Mount.prototype.getPath' in monitoredFunctionsAfter, 'getPath still monitored');
  t.equal(monitoredFunctionsAfter['Mount.prototype.getPath'], 'getPath_BP_ID');
  t.assert('Mount.prototype.serve' in monitoredFunctionsAfter, 'serve newly monitored');
  t.equal(monitoredFunctionsAfter['Mount.prototype.serve'], 'serve_BP_ID');
  t.assert(!('Mount.prototype.getUrl' in monitoredFunctionsBefore), 'getUrl removed');

  t.end();
});

test('skip unnecessary debugger pauses', function (t) {
  const pauseContextDueToOOM = {reason: 'OOM'};
  t.assert(dbg.ignorePause(pauseContextDueToOOM));

  const pauseContextWithoutBreakpointsObject = {reason: 'other'};
  t.assert(dbg.ignorePause(pauseContextWithoutBreakpointsObject));

  const pauseContextWithoutBreakpoints = {reason: 'other', hitBreakpoints: []};
  t.assert(dbg.ignorePause(pauseContextWithoutBreakpoints));

  const pauseContextWithBreakpoints = {reason: 'other', hitBreakpoints: ['breakpoint-id']};
  t.assert(!dbg.ignorePause(pauseContextWithBreakpoints));

  t.end();
});
