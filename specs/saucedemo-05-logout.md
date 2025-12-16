# SauceDemo - 菜单登出（手工验收）

## Preconditions

- Base URL 可访问：`https://www.saucedemo.com/`
- 有可用测试账号：
  - Username: `standard_user`
  - Password: `secret_sauce`

## Steps

1. Navigate to /
2. Fill the "Username" field with standard_user
3. Fill the "Password" field with secret_sauce
4. Click the "Login" button
5. Verify the user is logged in and sees the inventory/products page (e.g. header shows "Products")

6. Open the left menu (hamburger/menu button)
7. Verify the menu shows a "Logout" option
8. Click "Logout"
9. Verify the user is returned to the login page and is no longer authenticated
10. Verify the login form is visible again ("Username" and "Password" fields)
