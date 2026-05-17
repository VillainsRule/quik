import enquirer from 'enquirer';

import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

interface GenericError {
    success: false;
    errors: { message: string }[];
}

interface TunnelConfigResult {
    success: true;
    result: {
        config: {
            ingress: ({
                service: string;
                hostname: string;
                originRequest: {};
            } | { service: 'http_status:404' })[];
        }
    }
}

const { prompt } = enquirer;

const red = (msg: string) => console.log(`\x1b[31m${msg}\x1b[0m`);
const green = (msg: string) => console.log(`\x1b[32m${msg}\x1b[0m`);

// https://github.com/Atrox/haikunatorjs/blob/master/src/index.ts

const adjectives = [
    'aged', 'ancient', 'autumn', 'billowing', 'bitter', 'black', 'blue', 'bold',
    'broad', 'broken', 'calm', 'cold', 'cool', 'crimson', 'curly', 'damp',
    'dark', 'dawn', 'delicate', 'divine', 'dry', 'empty', 'falling', 'fancy',
    'flat', 'floral', 'fragrant', 'frosty', 'gentle', 'green', 'hidden', 'holy',
    'icy', 'jolly', 'late', 'lingering', 'little', 'lively', 'long', 'lucky',
    'misty', 'morning', 'muddy', 'mute', 'nameless', 'noisy', 'odd', 'old',
    'orange', 'patient', 'plain', 'polished', 'proud', 'purple', 'quiet', 'rapid',
    'raspy', 'red', 'restless', 'rough', 'round', 'royal', 'shiny', 'shrill',
    'shy', 'silent', 'small', 'snowy', 'soft', 'solitary', 'sparkling', 'spring',
    'square', 'steep', 'still', 'summer', 'super', 'sweet', 'tight', 'tiny',
    'twilight', 'wandering', 'weathered', 'white', 'wild', 'winter', 'wispy',
    'withered', 'yellow', 'young'
]

const nouns = [
    'art', 'band', 'bar', 'base', 'bird', 'block', 'boat', 'bonus',
    'bread', 'breeze', 'brook', 'bush', 'butterfly', 'cake', 'cell', 'cherry',
    'cloud', 'credit', 'darkness', 'dawn', 'dew', 'disk', 'dream', 'dust',
    'feather', 'field', 'fire', 'firefly', 'flower', 'fog', 'forest', 'frog',
    'frost', 'glade', 'glitter', 'grass', 'hall', 'hat', 'haze', 'heart',
    'hill', 'king', 'lab', 'lake', 'leaf', 'limit', 'math', 'meadow',
    'mode', 'moon', 'morning', 'mountain', 'mouse', 'mud', 'night', 'paper',
    'pine', 'poetry', 'pond', 'queen', 'rain', 'recipe', 'resonance', 'rice',
    'river', 'salad', 'scene', 'sea', 'shadow', 'shape', 'silence', 'sky',
    'smoke', 'snow', 'snowflake', 'sound', 'star', 'sun', 'sun', 'sunset',
    'surf', 'term', 'thunder', 'tooth', 'tree', 'truth', 'union', 'unit',
    'violet', 'voice', 'water', 'waterfall', 'wave', 'wildflower', 'wind'
]

const genRandomName = () => adjectives[adjectives.length * Math.random() | 0] + '-' + nouns[nouns.length * Math.random() | 0] + '-' + (Math.random() * 10000 | 1000);

const quikDir = path.join(os.homedir(), '.quik');
if (!fs.existsSync(quikDir)) fs.mkdirSync(quikDir, { recursive: true });

(async () => {
    const cloudflaredProcesses = execSync('ps aux | grep cloudflared', { stdio: 'pipe' });
    const grepProcess = cloudflaredProcesses.toString().split('\n').find((line) => line.includes('cloudflared') && line.includes('run') && line.includes('--token ey'));
    if (!grepProcess) (red('failed to find cloudflared process. make sure you have an active tunnel running.'), process.exit(1));

    const tunnelRunToken = grepProcess.match(/--token\s+([^\s]+)/)?.[1];
    if (!tunnelRunToken) (red('failed to extract tunnel token from cloudflared process. are you logged in?'), process.exit(1));

    const tunnelRawCreds = atob(tunnelRunToken);

    let tunnelCreds;

    try {
        tunnelCreds = JSON.parse(tunnelRawCreds);
    } catch {
        red('failed to parse tunnel credentials. make sure you have an active cloudflared tunnel running. raw credentials: ' + tunnelRawCreds);
        process.exit(1);
    }

    const tunnelId = tunnelCreds.t;
    const accountId = tunnelCreds.a;

    const tokenFile = path.join(quikDir, 'token.txt');
    const permissionFile = path.join(quikDir, 'permissions.txt');

    // https://cfdata.lol/tools/api-token-url-generator THANK YOUUU <3
    const permissions = encodeURIComponent(JSON.stringify([
        { key: 'dns', type: 'edit' },
        { key: 'zone', type: 'read' },
        { key: 'argotunnel', type: 'edit' },
        { key: 'cache', type: 'purge' }
    ]));

    let cfToken = fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf-8').trim() : '';
    let arePermissionsSame = fs.existsSync(permissionFile) && fs.readFileSync(permissionFile, 'utf-8').trim() === permissions;

    if (!cfToken || !arePermissionsSame) {
        console.log(`https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=${permissions}&accountId=${accountId}&zoneId=all\n`)

        const token = await prompt({
            type: 'input',
            name: 'token',
            message: 'create a cloudflare API token from the URL above',
            initial: ''
        }) as { token: string };

        fs.writeFileSync(tokenFile, token.token.trim());
        fs.writeFileSync(permissionFile, permissions);

        cfToken = token.token.trim();
    }

    const headers = { 'Authorization': `Bearer ${cfToken}`, 'Content-Type': 'application/json' };

    const zoneReq = await fetch('https://api.cloudflare.com/client/v4/zones', { headers });

    const zones = await zoneReq.json() as {
        result: [{
            id: string;
            name: string;
            account: { id: string };
        }]
    };

    if (!process.argv[2] || process.argv[2] === 'add') {
        const tunnelConfReq = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`, { headers });
        let tunnelConfig = await tunnelConfReq.json() as TunnelConfigResult | GenericError;
        if (!tunnelConfig.success) (red(`failed to fetch tunnel configuration: ${tunnelConfig.errors.map((e) => e.message).join(', ')}`), process.exit(1));

        const answers = await prompt([
            {
                type: 'select',
                name: 'domain',
                message: 'select a domain to use for the tunnel',
                choices: zones.result.sort((a, b) => {
                    const aHasQuik = a.name.toLowerCase().includes('quik');
                    const bHasQuik = b.name.toLowerCase().includes('quik');
                    if (aHasQuik === bHasQuik) return 0;
                    return aHasQuik ? -1 : 1;
                }).map((zone) => ({ name: zone.name, value: zone.name })),
            },
            {
                type: 'input',
                name: 'port',
                message: 'enter a port to run the server on',
                initial: '3000'
            }, {
                type: 'input',
                name: 'sub',
                message: 'enter a subdomain to use for the server',
                initial: genRandomName()
            }
        ]) as { domain: string; port: string; sub: string };

        const ingresRules = tunnelConfig.result.config.ingress;
        ingresRules.splice(ingresRules.length - 1, 0, {
            service: `http://localhost:${answers.port}`,
            hostname: `${answers.sub}.${answers.domain}`,
            originRequest: {}
        });

        const aReq = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`, {
            method: 'PUT',
            body: JSON.stringify({ config: tunnelConfig.result.config }),
            headers
        });

        const a = await aReq.json() as { success: true } | GenericError;
        if (!a.success) (red(`failed to update tunnel configuration: ${a.errors.map((e) => e.message).join(', ')}`), process.exit(1));

        const zoneId = zones.result.find((zone) => zone.name === answers.domain)?.id;
        const bReq = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
            method: 'POST',
            body: JSON.stringify({
                type: 'CNAME',
                name: answers.sub,
                content: `${tunnelId}.cfargotunnel.com`,
                proxied: true
            }),
            headers
        });

        const b = await bReq.json() as { success: true } | GenericError;
        if (b.success) green(`tunnel updated successfully! you can access your server at https://${answers.sub}.${answers.domain}`)
        else red(`failed to create DNS record: ${b.errors.map((e) => e.message).join(', ')}`);
    } else if (process.argv[2] === 'list') {
        const tunnelConfigReq = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`, { headers });
        const tunnelConfig = await tunnelConfigReq.json() as TunnelConfigResult | GenericError;
        if (!tunnelConfig.success) (red(`failed to fetch tunnel configuration: ${tunnelConfig.errors.map((e) => e.message).join(', ')}`), process.exit(1));

        const rules = tunnelConfig.result.config.ingress.filter((rule) => 'hostname' in rule).map((rule) => rule.hostname);

        if (rules.length > 1) {
            green('active tunnels:');
            rules.forEach((hostname: string) => console.log(`- ${hostname}`));
        } else green('no active tunnels found!');
    } else if (process.argv[2] === 'delete' || process.argv[2] === 'remove' || process.argv[2] === 'rm') {
        const tunnelConfigReq = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`, { headers });

        let tunnelConfig = await tunnelConfigReq.json() as TunnelConfigResult | GenericError;
        if (!tunnelConfig.success) (red(`failed to fetch tunnel configuration: ${tunnelConfig.errors.map((e) => e.message).join(', ')}`), process.exit(1));

        const answers = await prompt({
            type: 'multiselect',
            name: 'domain',
            message: 'select the subdomain(s) to delete',
            // @ts-expect-error useless untyped library
            hint: 'use space to toggle, enter to submit',
            choices: tunnelConfig.result.config.ingress.filter((rule) => 'hostname' in rule).map((rule) => ({
                name: `${rule.hostname} (${rule.service})`,
                value: rule.hostname
            })),
            result(names) {
                // @ts-expect-error useless untyped library
                return Object.values(this.map(names))
            }
        }) as { domain: string[] };

        if (answers.domain.length === 0) (red('no subdomains selected for deletion.'), process.exit(1));

        await Promise.all(answers.domain.map(async (domain) => {
            const zoneName = domain.split('.').splice(-2).join('.');

            const zone = zones.result.find((z) => z.name === zoneName);
            if (!zone) return red(`zone "${zoneName}" not found.`);

            const recordReq = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records`, { headers });

            const records = await recordReq.json() as { success: true, result: { id: string, name: string; type: string; }[] } | GenericError;
            if (!records.success) (red(`failed to fetch DNS records for zone ${zoneName}: ${records.errors.map((e) => e.message).join(', ')}`), process.exit(1));

            const record = records.result.find((r) => r.name === domain && r.type === 'CNAME');
            if (record) {
                const cReq = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records/${record.id}`, { headers });

                const c = await cReq.json() as { success: true } | GenericError;
                if (!c.success) (red(`failed to delete DNS record: ${c.errors.map((e) => e.message).join(', ')}`), process.exit(1));
            } else red(`DNS record for ${domain} not found.`);

            tunnelConfig.result.config.ingress = tunnelConfig.result.config.ingress.filter((rule) => !('hostname' in rule) || rule.hostname !== domain);
            green(`domain ${domain} ${record ? 'deleted DNS record & ' : ''}removed from tunnel configuration!`);
        }));

        const aReq = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`, {
            method: 'PUT',
            body: JSON.stringify({ config: tunnelConfig.result.config }),
            headers
        });

        const a = await aReq.json() as { success: true } | GenericError;
        if (a.success) green('selected subdomains deleted successfully!')
        else red(`failed to update tunnel configuration: ${a.errors.map((e) => e.message).join(', ')}`);
    } else if (process.argv[2] === 'purge') {
        const hostnames = process.argv.slice(3);
        if (hostnames.length === 0) (red('no hostnames provided for cache purge. usage: quik purge <hostname1> <hostname2> ...'), process.exit(1));

        for (const hostname of hostnames) {
            const zoneName = hostname.split('.').splice(-2).join('.');
            const zone = zones.result.find((z) => z.name === zoneName);
            if (!zone) {
                red(`zone "${zoneName}" not found for hostname "${hostname}", skipping...`);
                continue;
            }

            const purgeReq = await fetch(`https://api.cloudflare.com/client/v4/zones/${zone.id}/purge_cache`, {
                method: 'POST',
                body: JSON.stringify({ hosts: [hostname] }),
                headers
            });

            const purgeResult = await purgeReq.json() as { success: true } | GenericError;
            if (purgeResult.success) green(`cache purged successfully for ${hostname}`);
            else red(`failed to purge cache for ${hostname}: ${purgeResult.errors.map((e) => e.message).join(', ')}`);
        }
    } else if (process.argv[2] === 'token') console.log(cfToken);
    else red('invalid command. usage: quik [add|list|delete|remove|rm|purge]');
})();