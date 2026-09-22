// Progressive enhancement: all activity examples remain readable without JavaScript.
const programmeForm = document.querySelector('#programme-form');
const programmeTabs = [...document.querySelectorAll('[data-programme]')];
let activeProgramme = 'volunteering';
function enhanceTabs(container, tabs, panels, key, onSelect = () => {}) {
 container.setAttribute('role', 'tablist');
 const activate = (index, moveFocus = false) => {
  tabs.forEach((tab, i) => {
   const active = i === index;
   tab.disabled = false;
   tab.setAttribute('role', 'tab');
   tab.setAttribute('aria-selected', String(active));
   tab.setAttribute('aria-controls', panels[i].id);
   tab.tabIndex = active ? 0 : -1;
   panels[i].setAttribute('role', 'tabpanel');
   panels[i].setAttribute('aria-labelledby', tab.id);
   panels[i].tabIndex = 0;
   panels[i].hidden = !active;
  });
  onSelect(tabs[index].dataset[key]);
  if (moveFocus) tabs[index].focus();
 };
 tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => activate(index));
  tab.addEventListener('keydown', event => {
   let next = index;
   if (['ArrowRight','ArrowDown'].includes(event.key)) next = (index + 1) % tabs.length;
   else if (['ArrowLeft','ArrowUp'].includes(event.key)) next = (index + tabs.length - 1) % tabs.length;
   else if (event.key === 'Home') next = 0;
   else if (event.key === 'End') next = tabs.length - 1;
   else return;
   event.preventDefault(); activate(next, true);
  });
 });
 activate(0);
}
function chosenInputs() { return [...programmeForm.querySelectorAll('[name="programmes"]:checked')]; }
function syncInterest() {
 const chosen = chosenInputs();
 const input = programmeForm.querySelector(`[name="programmes"][value="${activeProgramme}"]`);
 const tab = programmeTabs.find(item => item.dataset.programme === activeProgramme);
 const label = tab.querySelector('strong').textContent.toLowerCase();
 const add = document.querySelector('#add-programme');
 add.setAttribute('aria-pressed', String(input.checked));
 add.textContent = input.checked ? `Remove ${label} from my interests` : `Add ${label} to my interests`;
 const text = chosen.length ? `Selected: ${chosen.map(item => programmeTabs.find(tab => tab.dataset.programme === item.value).querySelector('strong').textContent).join(', ')}. You can change these in the form.` : 'No programmes selected yet.';
 document.querySelector('#selection-status').textContent = text;
 const summary = document.querySelector('#form-selection-summary');
 summary.hidden = !chosen.length; summary.textContent = text;
}
enhanceTabs(document.querySelector('.programme-tabs'), programmeTabs, [...document.querySelectorAll('[data-panel]')], 'programme', value => {activeProgramme = value; syncInterest();});
enhanceTabs(document.querySelector('.coaching-steps'), [...document.querySelectorAll('[data-step]')], [...document.querySelectorAll('[data-coaching]')], 'step');
document.querySelector('.explorer-actions').hidden = false;
document.querySelector('#add-programme').addEventListener('click', () => {
 const input = programmeForm.querySelector(`[name="programmes"][value="${activeProgramme}"]`);
 input.checked = !input.checked;
 input.dispatchEvent(new Event('change', {bubbles:true}));
 if (input.checked && !programmeForm.elements.firstChoice.value) programmeForm.elements.firstChoice.value = activeProgramme;
 syncInterest();
});
programmeForm.querySelectorAll('[name="programmes"]').forEach(input => input.addEventListener('change', syncInterest));
window.addEventListener('pageshow', syncInterest);
