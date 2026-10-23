import fs from 'fs';
import path from 'path';
import vm from 'vm';

test('the sidebar shell can bootstrap again in an iframe whose global realm is retained', () => {
    const append = jest.fn();
    const window = {};
    const document = { createElement: () => ({}), head: { append } };
    const context = vm.createContext({ window, document });
    const source = fs.readFileSync(
        path.resolve(__dirname, '../resources/hypothes.is/annotator-plus-app-bootstrap.js'),
        'utf8'
    );

    vm.runInContext(source, context);
    vm.runInContext(source, context);

    expect(append).toHaveBeenCalledTimes(2);
    expect(append.mock.calls[1][0].src).toBe('https://cdn.hypothes.is/hypothesis/build/boot.js');
    expect(vm.runInContext('window.hypothesisConfig().apiUrl', context)).toBe('https://hypothes.is/api/');
});
