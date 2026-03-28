<div align='center'>
    <h1>quik</h1>
    <h3>a quik cli-based way to manage cloudflare.</h3>
</div>

<br><br>

## setup
1. find the executable intended for your system in [dist](./dist)
2. download and run it

optionally, if you're on mac/linux, add it as an alias in your terminal for easier use:

1. identify the shell (`echo $SHELL`)
2. find the path to the quik executable you downloaded (`pwd` in the folder where it is located)
3. add `alias quik='/path/to/quik-executable'` to your shell config file:
    - mac: `~/.zshrc` for zsh or `~/.bash_profile` for bash
    - linux: `~/.zshrc` for zsh or `~/.bashrc` for bash

if you want to build quik yourself (builds on mac/linux only):
1. install [bun](https://bun.sh)
2. clone the repo: `git clone https://github.com/VillainsRule/quik && cd quik`
3. build quik: `./build.sh`

<br><br>

## creating a cloudflare API key
this is needed for the program to start.

1. go to the [cloudflare account token page](https://dash.cloudflare.com/?to=/:account/api-tokens)
2. create one with the following permissions:

![permissions](https://files.catbox.moe/02vhok.png)

the summary should look like this:

![summary](https://files.catbox.moe/gm9m0r.png)

3. put it into quik

<br><br>
<h5 align='center'>made with :heart:</h5>
