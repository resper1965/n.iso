"""Valida CSV de achados da pré-avaliação de prontidão. Uso:
  python check_achados.py achados.csv [--fontes RAIZ IDS.txt] [--proibidos termo1,termo2]
  python check_achados.py --selftest

--proibidos: termos vedados só para ESTE cliente (ex.: nome de outro cliente que
não pode aparecer no entregável). Somam-se aos termos vedados em qualquer caso.
"""
import csv, io, os, sys

CAB = "id;bloco;requisito;severidade;veredito_s1;veredito_s2;pergunta_auditor;constatacao;fonte;correcao;dono;export_pedido".split(";")
SEV = {"NC maior", "NC menor", "OM"}
VER = {"atende", "parcial", "nao_atende", "na"}
OBRIG = ["id", "bloco", "requisito", "severidade", "veredito_s1", "veredito_s2", "constatacao", "fonte", "correcao", "dono"]
# Vedados sempre: a pré-avaliação não é auditoria, e "100%" promete o que a certificadora decide.
PROIBIDO = ["auditado", "100%"]


def validar(texto, raiz=None, ids=None, proibidos=()):
    erros, vistos = [], set()
    linhas = list(csv.reader(io.StringIO(texto), delimiter=";"))
    if not linhas or linhas[0] != CAB:
        return ["ERRO linha 1: cabeçalho diferente do padrão"], 0
    for n, lin in enumerate(linhas[1:], start=2):
        if len(lin) != len(CAB):
            erros.append(f"ERRO linha {n}: {len(lin)} colunas, esperado {len(CAB)}"); continue
        r = dict(zip(CAB, lin))
        for c in OBRIG:
            if not r[c].strip():
                erros.append(f"ERRO linha {n}: campo vazio {c}")
        if r["id"] in vistos:
            erros.append(f"ERRO linha {n}: id duplicado {r['id']}")
        vistos.add(r["id"])
        if r["severidade"] not in SEV:
            erros.append(f"ERRO linha {n}: severidade inválida {r['severidade']!r}")
        for c in ("veredito_s1", "veredito_s2"):
            if r[c] not in VER:
                erros.append(f"ERRO linha {n}: {c} inválido {r[c]!r}")
        baixo = " ".join(lin).lower()
        for p in PROIBIDO + [t.strip().lower() for t in proibidos if t.strip()]:
            if p in baixo:
                erros.append(f"ERRO linha {n}: termo proibido {p!r}")
        if raiz is not None:
            for f in [x.strip() for x in r["fonte"].split("|") if x.strip()]:
                if not (os.path.exists(os.path.join(raiz, f)) or f in ids):
                    erros.append(f"ERRO linha {n}: fonte não encontrada {f!r}")
    return erros, len(linhas) - 1


def _selftest():
    boa = ";".join(CAB) + "\nB1-01;1;4.3;NC menor;parcial;nao_atende;?;x;ctrl-a51;y;CIO;\n"
    assert validar(boa, ".", {"ctrl-a51"}) == ([], 1)
    assert "cabeçalho" in validar("a;b\n")[0][0]
    ruim = ";".join(CAB) + "\nB1-01;1;4.3;Grave;talvez;na;?;x;;y;CIO;\n"
    e, _ = validar(ruim)
    assert any("severidade" in m for m in e) and any("veredito_s1" in m for m in e) and any("fonte" in m for m in e)
    dup = boa + "B1-01;1;4.3;OM;atende;atende;?;x;ctrl-a51;y;CIO;\n"
    assert any("duplicado" in m for m in validar(dup)[0])
    assert any("fonte não encontrada" in m for m in validar(boa, ".", set())[0])
    assert any("proibido" in m for m in validar(boa.replace(";x;", ";foi auditado;"))[0])
    # Termo vedado por cliente: só vale quando informado.
    citado = boa.replace(";x;", ";cita o cliente Fulano;")
    assert validar(citado)[0] == []
    assert any("proibido" in m for m in validar(citado, proibidos=["fulano"])[0])
    print("selftest OK")


if __name__ == "__main__":
    if sys.argv[1:] == ["--selftest"]:
        _selftest(); sys.exit(0)
    arq = sys.argv[1]
    raiz = ids = None
    proibidos = ()
    if "--proibidos" in sys.argv:
        proibidos = sys.argv[sys.argv.index("--proibidos") + 1].split(",")
    if "--fontes" in sys.argv:
        i = sys.argv.index("--fontes")
        raiz = sys.argv[i + 1]
        with open(sys.argv[i + 2], encoding="utf-8") as fh:
            ids = {l.strip() for l in fh if l.strip()}
    with open(arq, encoding="utf-8-sig") as fh:
        erros, n = validar(fh.read(), raiz, ids, proibidos)
    for m in erros:
        print(m)
    print(f"OK {n} achados" if not erros else f"{len(erros)} erro(s)")
    sys.exit(1 if erros else 0)
