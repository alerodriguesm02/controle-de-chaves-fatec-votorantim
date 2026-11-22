"""End-to-end smoke test with a disposable database and browser profile."""
import os
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory

from playwright.sync_api import sync_playwright


def button(page, text):
    return page.get_by_role("button", name=text, exact=True)


def verify(page, address, output):
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(address)
    page.locator(".hero").wait_for()
    page.evaluate("document.fonts.ready")
    page.screenshot(path=output / "desktop.png", full_page=True)

    button(page, "Registrar movimentação").click()
    page.get_by_label("Código da chave").fill("CH-001")
    page.get_by_label("Docente responsável").select_option("professor")
    button(page, "Identificar chave").click()
    page.get_by_label("Finalidade do uso").fill("Pesquisa orientada")
    page.get_by_label("Justificativa do registro assistido").fill("Registro de teste assistido")

    page.get_by_label("Origem do registro").select_option("contingency")
    page.get_by_label("Horário físico informado").fill("2026-01-10T19:00")

    # A lost response must keep the same confirmation ID on retry.
    def drop_response(route):
        response = route.fetch()
        assert response.status == 200
        route.abort("failed")

    page.route("**/loans/confirm", drop_response, times=1)
    button(page, "Confirmar retirada").click()
    page.locator(".form-error:visible").wait_for()
    assert not page.get_by_role("heading", name="Retirada registrada").count()
    button(page, "Confirmar retirada").click()
    page.get_by_role("heading", name="Retirada registrada").wait_for()
    button(page, "Concluir").click()

    page.get_by_role("link", name="Quadro de chaves", exact=True).first.click()
    button(page, "Conferir etiqueta").click()
    page.get_by_label("Gancho e chave esperados").select_option("key-0")
    page.get_by_label("Leitura do QR").fill("fv:etiqueta-de-teste-desconhecida")
    button(page, "Registrar conferência").click()
    page.get_by_role("heading", name="Resultado da conferência").wait_for()
    page.get_by_text("QR desconhecido", exact=True).wait_for()
    button(page, "Concluir").click()
    page.get_by_role("link", name="Relatórios", exact=True).click()
    button(page, "Exportar").click()
    page.get_by_label("Finalidade da exportação").fill("Validação de relatório")
    with page.expect_download() as result:
        button(page, "Gerar arquivo").click()
    result.value.save_as(output / "relatorio.pdf")
    page.locator("#report-kind").select_option("daily")
    page.get_by_role("columnheader", name="Devoluções").wait_for()

    page.get_by_role("link", name="Cadastros", exact=True).click()
    button(page, "Ambientes").click()
    button(page, "Adicionar ambiente").click()
    page.get_by_label("Código", exact=True).fill("QA-01")
    page.get_by_label("Descrição").fill("Ambiente de homologação")
    page.get_by_label("Bloco").fill("Bloco QA")
    button(page, "Revisar").click()
    button(page, "Confirmar e salvar").click()
    page.get_by_role("cell", name="QA-01", exact=True).wait_for()

    page.get_by_role("button", name="Marina Costa").click()
    button(page, "Docente").click()
    page.get_by_role("heading", name="Olá, Carlos!").wait_for()
    button(page, "Ler QR Code").click()
    page.get_by_label("Código da chave").fill("CH-001")
    button(page, "Identificar chave").click()
    button(page, "Confirmar devolução").click()
    page.get_by_role("heading", name="Devolução registrada").wait_for()
    button(page, "Concluir").click()

    page.set_viewport_size({"width": 390, "height": 844})
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    page.screenshot(path=output / "mobile.png", full_page=True)
    button(page, "Abrir menu").click()
    page.get_by_role("link", name="Meu histórico").click()
    page.get_by_role("heading", name="Meu histórico").wait_for()
    assert not errors, errors


with TemporaryDirectory() as tmp, sync_playwright() as playwright:
    env = {
        **os.environ, "PORT": "0", "HOST": "127.0.0.1", "NODE_ENV": "test",
        "DEMO_MODE": "1", "DATABASE_URL": "", "PUBLIC_ORIGIN": "",
        "DB_FILE": str(Path(tmp) / "test.sqlite"),
    }
    server = subprocess.Popen(
        ["node", "server/main.js"], env=env, stdout=subprocess.PIPE, text=True
    )
    try:
        address = server.stdout.readline().split(" em ")[1].split(" · ")[0]
        browser = playwright.chromium.launch(
            channel="chrome", executable_path=os.environ.get("CHROME_BIN"), headless=True
        )
        page = browser.new_page(
            viewport={"width": 1440, "height": 950}, device_scale_factor=1,
            reduced_motion="reduce", service_workers="block",
        )
        verify(page, address, Path(os.environ.get("QA_OUTPUT", tmp)))
        browser.close()
        print("Desktop, celular, reenvio após resposta perdida, custódia, cadastros e relatórios validados.")
    finally:
        server.terminate()
        server.wait(timeout=8)
