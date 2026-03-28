import enquirer from 'enquirer';

import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { axiosLike } from './axiosLike.ts';

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

const tokenFile = path.join(quikDir, 'token.txt');
if (!fs.existsSync(tokenFile)) {
    const token = await prompt({
        type: 'input',
        name: 'token',
        message: 'enter your Cloudflare API token (see README)',
        initial: ''
    }) as { token: string };

    fs.writeFileSync(tokenFile, token.token.trim());
}

const cloudflareApiToken = fs.readFileSync(tokenFile, 'utf-8').trim();

const cloudflaredProcesses = execSync('ps aux | grep cloudflared', { stdio: 'pipe' });
const grepProcess = cloudflaredProcesses.toString().split('\n').find(line => line.includes('run --token ey'));
if (!grepProcess) {
    red('No active cloudflared tunnel found.')
    process.exit(1);
}

const tunnelRunToken = grepProcess.match(/--token\s+([^\s]+)/)?.[1];
if (!tunnelRunToken) {
    red('Failed to extract tunnel token from cloudflared process. Are you logged in?');
    process.exit(1);
}

const tunnelRawCreds = atob(tunnelRunToken);

let tunnelCreds;

try {
    tunnelCreds = JSON.parse(tunnelRawCreds);
} catch {
    red('Failed to parse tunnel credentials. Make sure you have an active cloudflared tunnel running. Raw credentials: ' + tunnelRawCreds);
    process.exit(1);
}

const tunnelId = tunnelCreds.t;
const accountId = tunnelCreds.a;

if (!process.argv[2] || process.argv[2] === 'add') {
    const zones = await axiosLike.get('https://api.cloudflare.com/client/v4/zones', {
        headers: {
            'Authorization': `Bearer ${cloudflareApiToken}`,
            'Content-Type': 'application/json'
        }
    });

    let tunnelConfig = await axiosLike.get(`https://api.cloudflare.com/client/v4/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`, {
        headers: {
            'Authorization': `Bearer ${cloudflareApiToken}`,
            'Content-Type': 'application/json'
        }
    });

    const answers = await prompt([
        {
            type: 'select',
            name: 'domain',
            message: 'select a domain to use for the tunnel',
            choices: zones.data.result.sort((a: any, b: any) => {
                const aHasQuik = a.name.toLowerCase().includes('quik');
                const bHasQuik = b.name.toLowerCase().includes('quik');
                if (aHasQuik === bHasQuik) return 0;
                return aHasQuik ? -1 : 1;
            }).map((zone: any) => ({ name: zone.name, value: zone.name })),
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

    const ingresRules = tunnelConfig.data.result.config.ingress;
    ingresRules.splice(ingresRules.length - 1, 0, {
        service: `http://localhost:${answers.port}`,
        hostname: `${answers.sub}.${answers.domain}`,
        originRequest: {}
    });

    const a = await axiosLike.put(`https://api.cloudflare.com/client/v4/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`, {
        config: tunnelConfig.data.result.config
    }, {
        headers: {
            'Authorization': `Bearer ${cloudflareApiToken}`,
            'Content-Type': 'application/json'
        }
    });

    if (!a.data.success) {
        red(`Failed to update tunnel configuration: ${a.data.errors.map((e: any) => e.message).join(', ')}`);
        process.exit(1);
    }

    const zoneId = zones.data.result.find((zone: any) => zone.name === answers.domain).id;
    const b = await axiosLike.post(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
        type: 'CNAME',
        name: answers.sub,
        content: `${tunnelId}.cfargotunnel.com`,
        proxied: true
    }, {
        headers: {
            'Authorization': `Bearer ${cloudflareApiToken}`,
            'Content-Type': 'application/json'
        }
    });

    if (b.data.success) green(`Tunnel updated successfully! You can access your server at https://${answers.sub}.${answers.domain}`)
    else red(`Failed to create DNS record: ${b.data.errors.map((e: any) => e.message).join(', ')}`);
} else if (process.argv[2] === 'list') {
    let tunnelConfig = await axiosLike.get(`https://api.cloudflare.com/client/v4/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`, {
        headers: {
            'Authorization': `Bearer ${cloudflareApiToken}`,
            'Content-Type': 'application/json'
        }
    });

    const rules = tunnelConfig.data.result.config.ingress.filter((rule: any) => rule.hostname).map((rule: any) => rule.hostname);

    if (rules.length === 0) {
        green('No active tunnels found!');
        process.exit(1);
    }

    green('active tunnels:');
    rules.forEach((hostname: string) => console.log(`- ${hostname}`));
} else if (process.argv[2] === 'delete' || process.argv[2] === 'remove' || process.argv[2] === 'rm') {
    let tunnelConfig = await axiosLike.get(`https://api.cloudflare.com/client/v4/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`, {
        headers: {
            'Authorization': `Bearer ${cloudflareApiToken}`,
            'Content-Type': 'application/json'
        }
    });

    const answers = await prompt({
        type: 'multiselect',
        name: 'domain',
        message: 'select the subdomain(s) to delete',
        // @ts-expect-error useless untyped library
        hint: 'use space to toggle, enter to submit',
        choices: tunnelConfig.data.result.config.ingress.filter((rule: any) => rule.hostname).map((rule: any) => ({
            name: `${rule.hostname} (${rule.service})`,
            value: rule.hostname
        })),
        result(names) {
            // @ts-expect-error useless untyped library
            return Object.values(this.map(names))
        }
    }) as { domain: string[] };

    if (answers.domain.length === 0) {
        red('No subdomains selected for deletion.');
        process.exit(1);
    }

    const zones = await axiosLike.get('https://api.cloudflare.com/client/v4/zones', {
        headers: {
            'Authorization': `Bearer ${cloudflareApiToken}`,
            'Content-Type': 'application/json'
        }
    });

    await Promise.all(answers.domain.map(async (domain) => {
        const zoneName = domain.split('.').splice(-2).join('.');

        const zone = zones.data.result.find((z: any) => z.name === zoneName);
        if (!zone) return red(`Zone "${zoneName}" not found.`);

        const records = await axiosLike.get(`https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records`, {
            headers: {
                'Authorization': `Bearer ${cloudflareApiToken}`,
                'Content-Type': 'application/json'
            }
        });

        const record = records.data.result.find((r: any) => r.name === domain && r.type === 'CNAME');
        if (record) {
            const c = await axiosLike.delete(`https://api.cloudflare.com/client/v4/zones/${zone.id}/dns_records/${record.id}`, {
                headers: {
                    'Authorization': `Bearer ${cloudflareApiToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!c.data.success) {
                red(`Failed to delete DNS record: ${c.data.errors.map((e: any) => e.message).join(', ')}`);
                process.exit(1);
            }
        } else red(`DNS record for ${domain} not found.`);

        tunnelConfig.data.result.config.ingress = tunnelConfig.data.result.config.ingress.filter((rule: any) => rule.hostname !== domain);

        green(`Domain ${domain} ${record ? 'deleted DNS record & ' : ''}removed from tunnel configuration!`);
    }));

    const a = await axiosLike.put(`https://api.cloudflare.com/client/v4/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`, {
        config: tunnelConfig.data.result.config
    }, {
        headers: {
            'Authorization': `Bearer ${cloudflareApiToken}`,
            'Content-Type': 'application/json'
        }
    });

    if (a.data.success) green('Selected subdomains deleted successfully!')
    else red(`Failed to update tunnel configuration: ${a.data.errors.map((e: any) => e.message).join(', ')}`);
} else if (process.argv[2] === 'purge') {
    const hostnames = process.argv.slice(3);
    if (hostnames.length === 0) {
        red('No hostnames provided for cache purge. Usage: quik purge <hostname1> <hostname2> ...');
        process.exit(1);
    }

    const zones = await axiosLike.get('https://api.cloudflare.com/client/v4/zones', {
        headers: {
            'Authorization': `Bearer ${cloudflareApiToken}`,
            'Content-Type': 'application/json'
        }
    });

    for (const hostname of hostnames) {
        const zoneName = hostname.split('.').splice(-2).join('.');
        const zone = zones.data.result.find((z: any) => z.name === zoneName);
        if (!zone) {
            red(`Zone "${zoneName}" not found for hostname "${hostname}". Skipping.`);
            continue;
        }

        const purgeResponse = await axiosLike.post(`https://api.cloudflare.com/client/v4/zones/${zone.id}/purge_cache`, {
            hosts: [hostname]
        }, {
            headers: {
                'Authorization': `Bearer ${cloudflareApiToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (purgeResponse.data.success) green(`Cache purged successfully for ${hostname}`);
        else red(`Failed to purge cache for ${hostname}: ${purgeResponse.data.errors.map((e: any) => e.message).join(', ')}`);
    }
}