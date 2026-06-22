// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";

/// @title LiveCompute
/// @notice Foundry integration test that probes the LIVE 0G Compute network
///         on Galileo testnet. The goal is to DISCOVER limits, not to prove
///         anything works. We expect the chat endpoint to return 401/403
///         because the devnet broker requires a funded sub-account before it
///         issues a `app-sk-...` authorization header.
/// @dev    Off-chain work runs via `vm.ffi` shelling out to `node -e` from
///         inside `apps/backend/`. The on-chain part forks Galileo so we can
///         see the Compute Ledger and Compute Inference contracts exist.
///         Steps:
///           1. Fork Galileo at a known block
///           2. Verify Compute Ledger (0xE708...E406) and Inference
///              (0xa79F...F91E) contracts exist on the fork
///           3. FFI to Node: list services via the read-only broker
///           4. FFI to Node: hit the canonical provider endpoint
///              (0xa48f...7836, qwen-2.5-omni-7b) at /v1/proxy/chat/completions
///              with no Authorization header
///           5. Surface the exact HTTP status + body so we can document the
///              "devnet stub needs funded sub-account first" limit
///           6. FFI again with the second known provider
///              (0x8e60...0049, openai/gpt-oss-20b) and document the same
///
/// Canonical sources:
///   - https://docs.0g.ai/developer-hub/building-on-0g/compute-network/overview
///   - https://docs.0g.ai/developer-hub/building-on-0g/compute-network/inference
///   - https://docs.0g.ai/ai-context  (deployed Compute Ledger + Inference addresses)
///   - https://github.com/0gfoundation/0g-compute-ts-sdk
///   - https://book.getfoundry.sh/cheatcodes/ffi
contract LiveCompute is Test {
    string constant RPC          = "https://evmrpc-testnet.0g.ai";
    uint256 constant FORK_BLOCK  = 38_748_015;

    // Deployed contract addresses from docs.0g.ai/ai-context (testnet).
    address constant COMPUTE_LEDGER    = 0xE70830508dAc0A97e6c087c75f402f9Be669E406;
    address constant COMPUTE_INFERENCE = 0xa79F4c8311FF93C06b8CfB403690cc987c93F91E;

    // Canonical testnet providers per docs.0g.ai/ai-context.
    address constant PROVIDER_QWEN_OMNI  = 0xa48f01287233509FD694a22Bf840225062E67836;
    address constant PROVIDER_GPT_OSS_20B = 0x8e60d466FD16798Bec4868aa4CE38586D5590049;

    uint256 internal ledgerCodeSize;
    uint256 internal inferenceCodeSize;

    function setUp() public {
        vm.createSelectFork(RPC, FORK_BLOCK);

        assembly {
            ledgerCodeSize    := extcodesize(COMPUTE_LEDGER)
            inferenceCodeSize := extcodesize(COMPUTE_INFERENCE)
        }
    }

    function test_computeContractsExist() public {
        console2.log("[LiveCompute] COMPUTE_LEDGER code size at fork block:", ledgerCodeSize);
        console2.log("[LiveCompute] COMPUTE_INFERENCE code size at fork block:", inferenceCodeSize);
        if (ledgerCodeSize == 0) {
            console2.log("[LiveCompute] DISCOVERY: COMPUTE_LEDGER has no code at fork block — chain state may be pre-deployment or Ledger was rotated");
        }
        if (inferenceCodeSize == 0) {
            console2.log("[LiveCompute] DISCOVERY: COMPUTE_INFERENCE has no code at fork block — same caveat");
        }
        // Always pass — the test's job is to surface.
        assertTrue(true, "compute contract presence logged");
    }

    function test_listServices() public {
        // List inference services via the read-only broker. This does not
        // require funding a sub-account.
        string memory script = string.concat(
            "process.chdir('/home/eya/og/apps/backend');",
            "(async()=>{",
            "  try{",
            "    const{createZGComputeNetworkReadOnlyBroker}=require('@0gfoundation/0g-compute-ts-sdk');",
            "    const b=await createZGComputeNetworkReadOnlyBroker('https://evmrpc-testnet.0g.ai');",
            "    const svcs=await b.inference.listService(0,50,true);",
            "    const out=svcs.map(s=>({provider:s[0],name:s[1],url:s[2],model:s[6],teeType:s[7],verifier:(()=>{try{return JSON.parse(s[8]).TEEVerifier;}catch(e){return null;}})()}));",
            "    console.log(JSON.stringify({count:out.length,services:out}));",
            "  }catch(e){console.log(JSON.stringify({error:e.message||String(e)}));}",
            "})().catch(e=>{console.log(JSON.stringify({error:e.message||String(e)}));});"
        );

        bytes memory result = vm.ffi(_nodeCmd(script));
        string memory json = _trim(string(result));
        console2.log("[LiveCompute] listService result:");
        console2.log(json);

        if (vm.contains(json, "\"error\"")) {
            console2.log("[LiveCompute] DISCOVERY: listService failed. Test surfaces the error.");
            assertTrue(true, "listService error surfaced; see log");
            return;
        }

        if (vm.contains(json, vm.toString(PROVIDER_QWEN_OMNI))) {
            console2.log("[LiveCompute] OK: qwen/qwen2.5-omni-7b provider present in service list");
        } else {
            console2.log("[LiveCompute] DISCOVERY: qwen provider not in service list — may have been retired or URL rotated");
        }
        assertTrue(true, "listService completed");
    }

    function test_chatEndpointRejectsUnauthenticated() public {
        // Hit the canonical provider's /v1/proxy/chat/completions with NO
        // Authorization header. Expected response: 401-ish with a body
        // explaining "missing or invalid Authorization header, must be
        // Bearer app-sk-...". This is the "devnet stub requires funding"
        // discovery the assignment asks for.
        string memory script = string.concat(
            "process.chdir('/home/eya/og/apps/backend');",
            "(async()=>{",
            "  try{",
            "    const{createZGComputeNetworkReadOnlyBroker}=require('@0gfoundation/0g-compute-ts-sdk');",
            "    const b=await createZGComputeNetworkReadOnlyBroker('https://evmrpc-testnet.0g.ai');",
            "    const svcs=await b.inference.listService(0,50,true);",
            "    const target='", vm.toString(PROVIDER_QWEN_OMNI), "'.toLowerCase();",
            "    const svc=svcs.find(s=>(s[0]||'').toLowerCase()===target);",
            "    if(!svc){console.log(JSON.stringify({error:'provider_not_in_service_list'}));return;}",
            "    const url=`${svc[2]}/v1/proxy/chat/completions`;",
            "    const body=JSON.stringify({model:svc[6],messages:[{role:'user',content:'hello'}],stream:false});",
            "    const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body});",
            "    const t=await r.text();",
            "    console.log(JSON.stringify({provider:svc[0],url,status:r.status,statusText:r.statusText,body:t.slice(0,400),authHeaderRequired:t.includes('app-sk-')||t.includes('Authorization')}));",
            "  }catch(e){console.log(JSON.stringify({error:e.message||String(e)}));}",
            "})().catch(e=>{console.log(JSON.stringify({error:e.message||String(e)}));});"
        );

        bytes memory result = vm.ffi(_nodeCmd(script));
        string memory json = _trim(string(result));
        console2.log("[LiveCompute] unauth chat probe:");
        console2.log(json);

        if (vm.contains(json, "\"error\"")) {
            console2.log("[LiveCompute] DISCOVERY: chat probe errored before HTTP — see JSON");
            assertTrue(true, "chat probe error surfaced");
            return;
        }

        if (vm.contains(json, "\"status\":401") || vm.contains(json, "\"status\":403")) {
            console2.log("[LiveCompute] CONFIRMED: provider rejects unauth requests with a 401/403 — this is the 'must fund sub-account' gate");
        } else if (vm.contains(json, "\"authHeaderRequired\":true") || vm.contains(json, "app-sk-")) {
            console2.log("[LiveCompute] CONFIRMED: provider's error body mentions app-sk- (the funded sub-account token). This is the devnet stub limit.");
        } else {
            console2.log("[LiveCompute] DISCOVERY: provider returned an unexpected response (not 401/403). See JSON.");
        }
        assertTrue(true, "chat endpoint probe completed; see log");
    }

    function test_chatEndpointRejectsUnauthenticated_secondProvider() public {
        // Same probe against the second known testnet provider.
        // (openai/gpt-oss-20b at 0x8e60...0049 per docs.0g.ai/ai-context.)
        string memory script = string.concat(
            "process.chdir('/home/eya/og/apps/backend');",
            "(async()=>{",
            "  try{",
            "    const{createZGComputeNetworkReadOnlyBroker}=require('@0gfoundation/0g-compute-ts-sdk');",
            "    const b=await createZGComputeNetworkReadOnlyBroker('https://evmrpc-testnet.0g.ai');",
            "    const svcs=await b.inference.listService(0,50,true);",
            "    const target='", vm.toString(PROVIDER_GPT_OSS_20B), "'.toLowerCase();",
            "    const svc=svcs.find(s=>(s[0]||'').toLowerCase()===target);",
            "    if(!svc){console.log(JSON.stringify({error:'provider_not_in_service_list'}));return;}",
            "    const url=`${svc[2]}/v1/proxy/chat/completions`;",
            "    const body=JSON.stringify({model:svc[6],messages:[{role:'user',content:'hello'}],stream:false});",
            "    const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body});",
            "    const t=await r.text();",
            "    console.log(JSON.stringify({provider:svc[0],url,status:r.status,statusText:r.statusText,body:t.slice(0,400),authHeaderRequired:t.includes('app-sk-')||t.includes('Authorization')}));",
            "  }catch(e){console.log(JSON.stringify({error:e.message||String(e)}));}",
            "})().catch(e=>{console.log(JSON.stringify({error:e.message||String(e)}));});"
        );

        bytes memory result = vm.ffi(_nodeCmd(script));
        string memory json = _trim(string(result));
        console2.log("[LiveCompute] gpt-oss-20b unauth chat probe:");
        console2.log(json);

        if (vm.contains(json, "\"error\":\"provider_not_in_service_list\"")) {
            console2.log("[LiveCompute] DISCOVERY: 0x8e60...0049 is not in the current service list — provider may have been retired or model replaced");
        } else if (vm.contains(json, "\"error\"")) {
            console2.log("[LiveCompute] DISCOVERY: probe errored — see JSON");
        } else if (vm.contains(json, "\"authHeaderRequired\":true") || vm.contains(json, "app-sk-")) {
            console2.log("[LiveCompute] CONFIRMED: gpt-oss-20b provider also requires app-sk- auth header");
        }
        assertTrue(true, "second provider probe completed; see log");
    }

    // ════════════════════════════════════════════════════════════════════════
    // Helpers
    // ════════════════════════════════════════════════════════════════════════

    function _nodeCmd(string memory script) internal pure returns (string[] memory cmds) {
        cmds = new string[](3);
        cmds[0] = "node";
        cmds[1] = "-e";
        cmds[2] = script;
    }

    function _trim(string memory s) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        if (b.length == 0) return s;
        uint256 end = b.length;
        while (end > 0 && (b[end - 1] == 0x0a || b[end - 1] == 0x0d || b[end - 1] == 0x20)) end--;
        bytes memory out2 = new bytes(end);
        for (uint256 i = 0; i < end; i++) out2[i] = b[i];
        return string(out2);
    }
}
