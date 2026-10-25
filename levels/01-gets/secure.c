#include <stdio.h>
#include <string.h>

void secure_read(void) {
    char buffer[16];
    printf("Enter your name: ");
    if (fgets(buffer, sizeof(buffer), stdin) != NULL) {
        buffer[strcspn(buffer, "\n")] = '\0'; /* strip trailing newline */
        printf("Hello, %s!\n", buffer);
    }
}

int main(void) {
    secure_read();
    printf("Returned safely.\n");
    return 0;
}
