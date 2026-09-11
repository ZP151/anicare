$ErrorActionPreference = 'Stop'
$container = 'supabase_db_animalhelper'
$sender = '00000000-0000-4000-8000-000000004201'
$recipient = '00000000-0000-4000-8000-000000004202'
$post = '00000000-0000-4000-8000-000000004210'
$erasure = '00000000-0000-4000-8000-000000004211'
$request = '00000000-0000-4000-8000-000000004212'
$conversation = '00000000-0000-4000-8000-000000004213'
$blockRequest = '00000000-0000-4000-8000-000000004214'

function Invoke-Psql([string]$Sql, [bool]$AllowFailure = $false) {
  $priorPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = & docker exec $container psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At -c $Sql 2>&1
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $priorPreference
  }
  if (-not $AllowFailure -and $exitCode -ne 0) { throw ($output | Out-String) }
  return @{ ExitCode = $exitCode; Text = ($output | Out-String) }
}

function Start-PsqlJob([string]$Sql) {
  Start-Job -ScriptBlock {
    param($Container, $Query)
    $output = & docker exec $Container psql -U postgres -d postgres -v ON_ERROR_STOP=1 -At -c $Query 2>&1
    [pscustomobject]@{ ExitCode = $LASTEXITCODE; Text = ($output | Out-String) }
  } -ArgumentList $container, $Sql
}

function Wait-LifecycleLock([string]$Description) {
  for ($i = 0; $i -lt 50; $i++) {
    $probe = Invoke-Psql "select pg_try_advisory_xact_lock(hashtextextended('direct_message_lifecycle',0))"
    if ($probe.Text.Trim() -match '(?m)^f$') { return }
    Start-Sleep -Milliseconds 100
  }
  throw "$Description did not acquire lifecycle lock"
}

$cleanup = "delete from private.account_erasure_requests where request_id='$erasure'; delete from public.user_blocks where blocker_id in ('$sender','$recipient') and blocked_id in ('$sender','$recipient'); delete from private.direct_message_requests where actor_id in ('$sender','$recipient') and request_id in ('$request','$blockRequest'); delete from private.safety_requests where actor_id in ('$sender','$recipient') and request_id in ('$request','$blockRequest'); delete from private.direct_conversations where member_low_id='$sender' and member_high_id='$recipient'; delete from public.community_posts where id='$post'; set session_replication_role=replica; delete from public.user_profiles where id in ('$sender','$recipient'); delete from auth.users where id in ('$sender','$recipient'); set session_replication_role=origin;"
$job = $null

try {
  Invoke-Psql $cleanup | Out-Null
  $setup = "set session_replication_role=replica; insert into auth.users(id,email,created_at,updated_at) values ('$sender','race-sender@example.test',now(),now()),('$recipient','race-recipient@example.test',now(),now()); insert into public.user_profiles(id,public_name,adult_confirmed_at) values ('$sender','Race sender',now()),('$recipient','Race recipient',now()); set session_replication_role=origin; insert into public.community_posts(id,author_id,body,community_slug) values('$post','$recipient','Race anchor','race-test');"
  Invoke-Psql $setup | Out-Null

  $hold = "begin; set role authenticated; select set_config('request.jwt.claim.role','authenticated',true); select set_config('request.jwt.claim.sub','$recipient',true); select * from public.request_account_erasure('$erasure'); select pg_sleep(2); commit;"
  $job = Start-PsqlJob $hold
  Wait-LifecycleLock 'erasure holder'
  $send = "set role authenticated; select set_config('request.jwt.claim.role','authenticated',true); select set_config('request.jwt.claim.sub','$sender',true); select * from public.create_direct_message_request('community_post','$post','must fail','$request');"
  $result = Invoke-Psql $send $true
  $jobResult = Receive-Job $job -Wait
  Remove-Job $job
  $job = $null
  if ($jobResult.ExitCode -ne 0) { throw "erasure holder failed: $($jobResult.Text)" }
  $count = (Invoke-Psql "select count(*) from private.direct_conversations where member_low_id='$sender' and member_high_id='$recipient'").Text.Trim()
  if ($result.ExitCode -eq 0 -or $result.Text -notmatch 'direct_message_target_not_available' -or $count -notmatch '(?m)^0$') { throw "R3 erasure race failed: $($result.Text) / conversations=$count" }
  Write-Output 'R3 erasure/first-contact race passed'

  Invoke-Psql "delete from private.account_erasure_requests where request_id='$erasure'; insert into private.direct_conversations(id,member_low_id,member_high_id,requested_by,status) values('$conversation','$sender','$recipient','$sender','accepted'); insert into private.direct_conversation_members(conversation_id,member_id) values('$conversation','$sender'),('$conversation','$recipient');" | Out-Null
  $block = "begin; set role authenticated; select set_config('request.jwt.claim.role','authenticated',true); select set_config('request.jwt.claim.sub','$recipient',true); select public.block_direct_conversation('$conversation','$blockRequest'); select pg_sleep(2); commit;"
  $job = Start-PsqlJob $block
  Wait-LifecycleLock 'block holder'
  $send = "set role authenticated; select set_config('request.jwt.claim.role','authenticated',true); select set_config('request.jwt.claim.sub','$sender',true); select * from public.send_direct_message('$conversation','must not persist','$blockRequest');"
  $result = Invoke-Psql $send $true
  $jobResult = Receive-Job $job -Wait
  Remove-Job $job
  $job = $null
  if ($jobResult.ExitCode -ne 0) { throw "block holder failed: $($jobResult.Text)" }
  $messages = (Invoke-Psql "select count(*) from private.direct_messages where conversation_id='$conversation'").Text.Trim()
  if ($result.ExitCode -eq 0 -or $result.Text -notmatch 'direct_message_not_available' -or $messages -notmatch '(?m)^0$') { throw "R3 block/send race failed: $($result.Text) / messages=$messages" }
  Write-Output 'R3 block/send race passed'
} finally {
  if ($null -ne $job) {
    Stop-Job $job -ErrorAction SilentlyContinue
    Remove-Job $job -Force -ErrorAction SilentlyContinue
  }
  Invoke-Psql $cleanup | Out-Null
}
